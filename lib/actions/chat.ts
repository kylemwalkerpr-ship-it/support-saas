'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getClerkUserId } from '@/lib/auth'
import { SUPPORT_INBOXES, estimateWaitMinutes } from '@/lib/chat/knowledge'
import type { ChatConversation, ChatMessage, Profile } from '@/lib/types'

async function requireSupportProfile() {
  const userId = await getClerkUserId()
  if (!userId) throw new Error('Unauthorized')

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('*')
    .eq('clerk_user_id', userId)
    .single()

  if (!profile || !['admin', 'consultant'].includes(profile.role)) {
    throw new Error('Forbidden')
  }

  return profile as Profile
}

export async function getSupportDashboardData() {
  await requireSupportProfile()
  const db = createSupabaseAdminClient()

  const [{ data: conversations }, { data: messages }, { data: presence }, { data: notifications }] =
    await Promise.all([
      db
        .from('chat_conversations')
        .select('*, assigned_to:profiles(*)')
        .order('last_message_at', { ascending: false })
        .limit(100),
      db
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(500),
      db.from('support_presence').select('*, profile:profiles(*)'),
      db
        .from('chat_notifications')
        .select('*')
        .in('target_email', SUPPORT_INBOXES)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

  const open = (conversations ?? []).filter((c) =>
    ['ai_active', 'waiting_for_agent', 'assigned'].includes(c.status)
  )
  const queue = (conversations ?? []).filter((c) => c.status === 'waiting_for_agent')
  const availableAgents = (presence ?? []).filter((p) => p.status === 'available').length

  return {
    conversations: (conversations as ChatConversation[]) ?? [],
    messages: (messages as ChatMessage[]) ?? [],
    notifications: notifications ?? [],
    presence: presence ?? [],
    metrics: {
      open: open.length,
      waiting: queue.length,
      aiHandled: (conversations ?? []).filter((c) => c.status === 'ai_active').length,
      resolved: (conversations ?? []).filter((c) => c.status === 'resolved').length,
      availableAgents,
      estimatedWaitMinutes: estimateWaitMinutes(queue.length || 1, availableAgents),
    },
  }
}

export async function assignConversation(conversationId: string) {
  const profile = await requireSupportProfile()
  const db = createSupabaseAdminClient()

  await db
    .from('chat_conversations')
    .update({
      assigned_to_id: profile.id,
      status: 'assigned',
    })
    .eq('id', conversationId)

  await db.from('chat_messages').insert({
    conversation_id: conversationId,
    sender_type: 'system',
    sender_name: 'Yousafe Support',
    body: `${profile.full_name || profile.email} joined the conversation.`,
  })
}

export async function sendAgentMessage(conversationId: string, body: string) {
  const profile = await requireSupportProfile()
  const db = createSupabaseAdminClient()

  await db.from('chat_messages').insert({
    conversation_id: conversationId,
    sender_type: 'agent',
    sender_id: profile.id,
    sender_name: profile.full_name || 'Yousafe Support',
    body,
  })

  await db
    .from('chat_conversations')
    .update({
      status: 'assigned',
      assigned_to_id: profile.id,
      last_message: body,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
}

export async function resolveConversation(conversationId: string) {
  await requireSupportProfile()
  const db = createSupabaseAdminClient()
  await db
    .from('chat_conversations')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
}
