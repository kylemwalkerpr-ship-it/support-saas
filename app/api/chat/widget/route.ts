import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { generateChatAnswer } from '@/lib/chat/ai'
import {
  SUPPORT_INBOXES,
  estimateWaitMinutes,
  shouldEscalateToLiveAgent,
} from '@/lib/chat/knowledge'
import {
  authorizeConversation,
  corsHeadersFor,
  generateVisitorToken,
  hashVisitorToken,
  loadWidgetPayload,
  readVisitorToken,
} from '@/lib/chat/widgetAuth.mjs'

// Phase 5 CORS: YouSafe origins only (see lib/chat/widgetAuth.mjs); never a wildcard.
const METHODS = 'GET, POST, OPTIONS'

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request, METHODS) })
}

export async function POST(request: NextRequest) {
  const corsHeaders = { ...corsHeadersFor(request, METHODS), 'Cache-Control': 'no-store' }
  try {
    const body = await request.json()
    const message = String(body.message || '').trim()
    if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400, headers: corsHeaders })

    const db = createSupabaseAdminClient()
    let conversationId = body.conversationId as string | undefined
    let existingStatus: string | null = null

    // A visitor may only continue a conversation they hold the token for
    // (X-Chat-Token). Unknown id, wrong/missing token, a pre-token legacy
    // conversation, or a closed one: start a fresh conversation instead of
    // writing into (or echoing back) someone else's transcript.
    let restarted = false
    if (conversationId) {
      const existingConversation = await authorizeConversation(db, conversationId, readVisitorToken(request))
      existingStatus = (existingConversation?.status as string | undefined) ?? null
      if (!existingConversation || ['resolved', 'closed'].includes(existingStatus ?? '')) {
        restarted = true
        conversationId = undefined
        existingStatus = null
      }
    }

    // Raw token is returned once, to the creator only; just its hash is stored.
    let visitorToken: string | undefined
    if (!conversationId) {
      const nowIso = new Date().toISOString()
      visitorToken = generateVisitorToken()
      const { data: conversation, error } = await db
        .from('chat_conversations')
        .insert({
          visitor_name: body.visitor?.name || null,
          visitor_email: body.visitor?.email || null,
          visitor_phone: body.visitor?.phone || null,
          topic: body.topic || 'support',
          last_message: message,
          last_message_at: nowIso,
          // Phase 5 inbox SLA columns.
          last_customer_message_at: nowIso,
          inbox_status: 'open',
          visitor_token_hash: await hashVisitorToken(visitorToken),
        })
        .select('id, status')
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
      conversationId = conversation.id
      existingStatus = conversation.status
    }

    if (!conversationId) {
      return NextResponse.json({ error: 'Unable to create conversation' }, { status: 500, headers: corsHeaders })
    }

    const { error: visitorError } = await db.from('chat_messages').insert({
      conversation_id: conversationId,
      sender_type: 'visitor',
      sender_name: body.visitor?.name || 'Visitor',
      body: message,
    })
    if (visitorError) return NextResponse.json({ error: visitorError.message }, { status: 500, headers: corsHeaders })

    if (existingStatus === 'assigned' || existingStatus === 'waiting_for_agent') {
      const nextStatus = body.requestAgent === true ? 'waiting_for_agent' : existingStatus
      const nowIso = new Date().toISOString()
      const updatePayload: Record<string, unknown> = {
        status: nextStatus,
        last_message: message,
        last_message_at: nowIso,
        last_customer_message_at: nowIso,
        // Reopen if the customer writes back after we marked resolved/snoozed.
        inbox_status: 'open',
        snoozed_until: null,
      }
      if (body.requestAgent === true) {
        updatePayload.priority = 'high'
        updatePayload.requested_agent_at = new Date().toISOString()
      }

      const { error: updateError } = await db
        .from('chat_conversations')
        .update(updatePayload)
        .eq('id', conversationId)

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: corsHeaders })
      if (nextStatus === 'waiting_for_agent') await notifySupport(conversationId, message)

      const result = await loadWidgetPayload(db, conversationId, estimateWaitMinutes)
      return NextResponse.json({ ...result, ...(visitorToken ? { visitorToken, restarted } : {}) }, { headers: corsHeaders })
    }

    const { data: history } = await db
      .from('chat_messages')
      .select('sender_type, body')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20)

    const wantsAgent = shouldEscalateToLiveAgent(message) || body.requestAgent === true

    if (wantsAgent) {
      const nowIso = new Date().toISOString()
      await db
        .from('chat_conversations')
        .update({
          status: 'waiting_for_agent',
          priority: message.toLowerCase().includes('urgent') ? 'urgent' : 'high',
          requested_agent_at: nowIso,
          last_message: message,
          last_message_at: nowIso,
          last_customer_message_at: nowIso,
          inbox_status: 'open',
          snoozed_until: null,
        })
        .eq('id', conversationId)

      await db.from('chat_messages').insert({
        conversation_id: conversationId,
        sender_type: 'system',
        sender_name: 'YouSafe Support',
        body: 'You are in the live support queue. A team member will join as soon as possible.',
      })

      await notifySupport(conversationId, message)
    } else {
      const answer = await generateChatAnswer({
        message,
        history: (history ?? []).map((m) => ({
          role: m.sender_type === 'visitor' ? 'user' : 'assistant',
          content: m.body,
        })),
      })

      const { error: aiMessageError } = await db.from('chat_messages').insert({
        conversation_id: conversationId,
        sender_type: 'ai',
        sender_name: 'YouSafe Chat Agent',
        body: answer,
      })
      if (aiMessageError) {
        return NextResponse.json({ error: aiMessageError.message }, { status: 500, headers: corsHeaders })
      }

      // Note: we record the customer's send time as last_customer_message_at
      // even though the row's last_message text is the AI reply — the SLA
      // clock measures customer-wait time, not AI activity.
      const nowIso = new Date().toISOString()
      const { error: updateError } = await db
        .from('chat_conversations')
        .update({
          status: 'ai_active',
          last_message: answer,
          last_message_at: nowIso,
          last_customer_message_at: nowIso,
        })
        .eq('id', conversationId)
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500, headers: corsHeaders })
      }
    }

    const result = await loadWidgetPayload(db, conversationId, estimateWaitMinutes)
    return NextResponse.json({ ...result, ...(visitorToken ? { visitorToken, restarted } : {}) }, { headers: corsHeaders })
  } catch (error) {
    console.error('[chat/widget] failed', error)
    return NextResponse.json(
      { error: 'Unable to send your message right now.' },
      { status: 500, headers: corsHeaders }
    )
  }
}

async function notifySupport(conversationId: string, message: string) {
  const db = createSupabaseAdminClient()
  const { error } = await db.from('chat_notifications').insert(
    SUPPORT_INBOXES.map((target_email) => ({
      conversation_id: conversationId,
      target_email,
      title: 'Live chat request',
      message,
    }))
  )
  if (error) console.error('[chat/widget] support notification failed', error)
}
