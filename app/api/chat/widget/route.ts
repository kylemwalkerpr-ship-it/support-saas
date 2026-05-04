import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { generateChatAnswer } from '@/lib/chat/ai'
import {
  SUPPORT_INBOXES,
  estimateWaitMinutes,
  shouldEscalateToLiveAgent,
} from '@/lib/chat/knowledge'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const message = String(body.message || '').trim()
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400, headers: corsHeaders })

  const db = createSupabaseAdminClient()
  let conversationId = body.conversationId as string | undefined

  if (!conversationId) {
    const { data: conversation, error } = await db
      .from('chat_conversations')
      .insert({
        visitor_name: body.visitor?.name || null,
        visitor_email: body.visitor?.email || null,
        visitor_phone: body.visitor?.phone || null,
        topic: body.topic || 'support',
        last_message: message,
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
    conversationId = conversation.id
  }

  if (!conversationId) {
    return NextResponse.json({ error: 'Unable to create conversation' }, { status: 500, headers: corsHeaders })
  }

  await db.from('chat_messages').insert({
    conversation_id: conversationId,
    sender_type: 'visitor',
    sender_name: body.visitor?.name || 'Visitor',
    body: message,
  })

  const { data: history } = await db
    .from('chat_messages')
    .select('sender_type, body')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(20)

  const wantsAgent = shouldEscalateToLiveAgent(message) || body.requestAgent === true

  if (wantsAgent) {
    await db
      .from('chat_conversations')
      .update({
        status: 'waiting_for_agent',
        priority: message.toLowerCase().includes('urgent') ? 'urgent' : 'high',
        requested_agent_at: new Date().toISOString(),
        last_message: message,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    await db.from('chat_messages').insert({
      conversation_id: conversationId,
      sender_type: 'system',
      sender_name: 'Yousafe Support',
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

    await db.from('chat_messages').insert({
      conversation_id: conversationId,
      sender_type: 'ai',
      sender_name: 'Yousafe AI',
      body: answer,
    })

    await db
      .from('chat_conversations')
      .update({
        status: 'ai_active',
        last_message: answer,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
  }

  const result = await loadConversation(conversationId)
  return NextResponse.json(result, { headers: corsHeaders })
}

async function notifySupport(conversationId: string, message: string) {
  const db = createSupabaseAdminClient()
  await db.from('chat_notifications').insert(
    SUPPORT_INBOXES.map((target_email) => ({
      conversation_id: conversationId,
      target_email,
      title: 'Live chat request',
      message,
    }))
  )
}

async function loadConversation(conversationId: string) {
  const db = createSupabaseAdminClient()
  const [{ data: conversation }, { data: messages }, { count }] = await Promise.all([
    db.from('chat_conversations').select('*').eq('id', conversationId).single(),
    db
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }),
    db
      .from('chat_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'waiting_for_agent'),
  ])

  const queuePosition = conversation?.status === 'waiting_for_agent' ? count || 1 : 0
  return {
    conversation,
    messages: messages ?? [],
    queue: {
      position: queuePosition,
      estimatedWaitMinutes: queuePosition ? estimateWaitMinutes(queuePosition, 0) : 0,
    },
  }
}
