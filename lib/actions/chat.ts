'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getClerkUserId } from '@/lib/auth'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { SUPPORT_INBOXES, estimateWaitMinutes } from '@/lib/chat/knowledge'
import type { ChatConversation, ChatMessage, Profile } from '@/lib/types'

async function requireSupportProfile() {
  const userId = await getClerkUserId()
  if (!userId) throw new Error('Unauthorized')

  const profile = await getOrCreateProfile()

  if (
    !profile ||
    !['admin', 'support'].includes(profile.role) ||
    (profile.role === 'support' && profile.status !== 'active')
  ) {
    throw new Error('Forbidden')
  }

  return profile as Profile
}

export async function getSupportDashboardData() {
  const profile = await requireSupportProfile()
  const db = createSupabaseAdminClient()

  await db.from('support_presence').upsert(
    {
      profile_id: profile.id,
      status: 'available',
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id', ignoreDuplicates: false }
  )

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

async function requireConversation(conversationId: string) {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from('chat_conversations')
    .select('*')
    .eq('id', conversationId)
    .single()

  if (error || !data) throw new Error('Conversation not found')
  return data as ChatConversation
}

async function insertSystemMessage(conversationId: string, body: string, senderName = 'Yousafe Support') {
  const db = createSupabaseAdminClient()
  const { error } = await db.from('chat_messages').insert({
    conversation_id: conversationId,
    sender_type: 'system',
    sender_name: senderName,
    body,
  })
  if (error) throw new Error(error.message)
}

export async function assignConversation(conversationId: string) {
  const profile = await requireSupportProfile()
  const db = createSupabaseAdminClient()
  await requireConversation(conversationId)
  const agentName = profile.full_name || profile.email || 'Yousafe Support'
  const agentAvatarUrl =
    profile.avatar_url || `/api/avatar?seed=${encodeURIComponent(agentName)}`

  const { data: current } = await db
    .from('chat_conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single()

  const metadata =
    current?.metadata && typeof current.metadata === 'object'
      ? (current.metadata as Record<string, unknown>)
      : {}

  const { error: updateError } = await db
    .from('chat_conversations')
    .update({
      assigned_to_id: profile.id,
      status: 'assigned',
      metadata: {
        ...metadata,
        assigned_agent_id: profile.id,
        assigned_agent_name: agentName,
        assigned_agent_avatar_url: agentAvatarUrl,
        assigned_at: new Date().toISOString(),
      },
    })
    .eq('id', conversationId)
  if (updateError) throw new Error(updateError.message)

  const { error: messageError } = await db.from('chat_messages').insert({
    conversation_id: conversationId,
    sender_type: 'system',
    sender_id: profile.id,
    sender_name: agentName,
    body: `${agentName} joined the conversation.`,
    metadata: {
      agent_avatar_url: agentAvatarUrl,
    },
  })
  if (messageError) throw new Error(messageError.message)
}

export async function assignNextConversation() {
  const profile = await requireSupportProfile()
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from('chat_conversations')
    .select('id, priority, requested_agent_at, last_message_at')
    .eq('status', 'waiting_for_agent')
    .order('requested_agent_at', { ascending: true })
    .limit(50)

  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('No customers are waiting')

  const priorityWeight = { urgent: 4, high: 3, normal: 2, low: 1 } as Record<string, number>
  const next = [...data].sort((a, b) => {
    const priorityDelta = (priorityWeight[b.priority] ?? 0) - (priorityWeight[a.priority] ?? 0)
    if (priorityDelta !== 0) return priorityDelta
    const aTime = Date.parse(a.requested_agent_at ?? a.last_message_at ?? '')
    const bTime = Date.parse(b.requested_agent_at ?? b.last_message_at ?? '')
    return aTime - bTime
  })[0]

  await assignConversation(next.id)
  await db.from('support_presence').upsert(
    {
      profile_id: profile.id,
      status: 'busy',
      active_conversations: 1,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id', ignoreDuplicates: false }
  )

  return next.id as string
}

export async function sendAgentMessage(conversationId: string, body: string) {
  const profile = await requireSupportProfile()
  const db = createSupabaseAdminClient()
  const agentName = profile.full_name || profile.email || 'Yousafe Support'
  const agentAvatarUrl =
    profile.avatar_url || `/api/avatar?seed=${encodeURIComponent(agentName)}`

  await requireConversation(conversationId)
  const { error: messageError } = await db.from('chat_messages').insert({
    conversation_id: conversationId,
    sender_type: 'agent',
    sender_id: profile.id,
    sender_name: agentName,
    body,
    metadata: {
      agent_avatar_url: agentAvatarUrl,
    },
  })
  if (messageError) throw new Error(messageError.message)

  const { error: updateError } = await db
    .from('chat_conversations')
    .update({
      status: 'assigned',
      assigned_to_id: profile.id,
      last_message: body,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
  if (updateError) throw new Error(updateError.message)
}

export async function resolveConversation(conversationId: string) {
  await requireSupportProfile()
  const db = createSupabaseAdminClient()
  await requireConversation(conversationId)
  const { error } = await db
    .from('chat_conversations')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
  if (error) throw new Error(error.message)
  await insertSystemMessage(conversationId, 'This conversation was marked resolved. Reply again if you still need help.')
  await db.from('chat_notifications').update({ is_read: true }).eq('conversation_id', conversationId)
}

export async function closeConversation(conversationId: string) {
  await requireSupportProfile()
  const db = createSupabaseAdminClient()
  await requireConversation(conversationId)
  const { error } = await db
    .from('chat_conversations')
    .update({
      status: 'closed',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
  if (error) throw new Error(error.message)
  await insertSystemMessage(conversationId, 'This conversation was closed by Yousafe Support.')
  await db.from('chat_notifications').update({ is_read: true }).eq('conversation_id', conversationId)
}

export async function escalateConversation(conversationId: string) {
  await requireSupportProfile()
  const db = createSupabaseAdminClient()
  await requireConversation(conversationId)
  const { error: updateError } = await db
    .from('chat_conversations')
    .update({
      status: 'waiting_for_agent',
      priority: 'urgent',
      requested_agent_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
  if (updateError) throw new Error(updateError.message)

  await insertSystemMessage(conversationId, 'This ticket was escalated for priority support review.')
}

export async function markConversationRead(conversationId: string) {
  const profile = await requireSupportProfile()
  const db = createSupabaseAdminClient()

  const { data: conversation } = await db
    .from('chat_conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single()

  const metadata =
    conversation?.metadata && typeof conversation.metadata === 'object'
      ? (conversation.metadata as Record<string, unknown>)
      : {}

  const { error: updateError } = await db
    .from('chat_conversations')
    .update({
      metadata: {
        ...metadata,
        read_at: new Date().toISOString(),
        read_by_id: profile.id,
      },
    })
    .eq('id', conversationId)
  if (updateError) throw new Error(updateError.message)

  await db
    .from('chat_notifications')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
}

export async function clearWaitingQueue() {
  const profile = await requireSupportProfile()
  const db = createSupabaseAdminClient()
  const { data: waiting, error: loadError } = await db
    .from('chat_conversations')
    .select('id')
    .eq('status', 'waiting_for_agent')

  if (loadError) throw new Error(loadError.message)
  if (!waiting?.length) return 0

  const ids = waiting.map((conversation) => conversation.id)
  const now = new Date().toISOString()
  const { error: updateError } = await db
    .from('chat_conversations')
    .update({
      status: 'closed',
      resolved_at: now,
      last_message: 'This chat queue item was cleared by Yousafe Support.',
      last_message_at: now,
    })
    .in('id', ids)

  if (updateError) throw new Error(updateError.message)

  const agentName = profile.full_name || profile.email || 'Yousafe Support'
  const { error: messageError } = await db.from('chat_messages').insert(
    ids.map((conversationId) => ({
      conversation_id: conversationId,
      sender_type: 'system',
      sender_id: profile.id,
      sender_name: agentName,
      body: 'This waiting chat was cleared by Yousafe Support. Please start a new chat if you still need help.',
    }))
  )
  if (messageError) throw new Error(messageError.message)

  await db.from('chat_notifications').update({ is_read: true }).in('conversation_id', ids)
  return ids.length
}

export async function clearClosedConversations() {
  await requireSupportProfile()
  const db = createSupabaseAdminClient()
  const { data: closed, error: loadError } = await db
    .from('chat_conversations')
    .select('id')
    .in('status', ['resolved', 'closed'])

  if (loadError) throw new Error(loadError.message)
  if (!closed?.length) return 0

  const ids = closed.map((conversation) => conversation.id)
  const { error } = await db.from('chat_conversations').delete().in('id', ids)
  if (error) throw new Error(error.message)
  return ids.length
}
