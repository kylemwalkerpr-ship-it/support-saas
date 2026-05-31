'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import {
  logSupportAction,
  SupportActionError,
} from '@/lib/actions/support-audit'
import {
  getMacroById,
  renderMacroBody,
  type RenderContext,
} from '@/lib/actions/support-macros'
import type {
  Profile,
  ChatConversation,
  ChatMessage,
  InboxStatus,
  InboxChannel,
} from '@/lib/types'

// ============================================================
// Phase 5 — Inbox queries + mutations
// ============================================================

export interface SearchInboxInput {
  status?: InboxStatus | InboxStatus[]
  assignment?: 'mine' | 'unassigned' | 'all'
  channel?: InboxChannel | null
  cursor?: string | null
  limit?: number
}

export interface InboxRow extends ChatConversation {
  customer_label: string | null
  unread_for_agent: boolean
}

export interface SearchInboxResult {
  conversations: InboxRow[]
  nextCursor: string | null
  total: number
}

export interface ConversationBundle {
  conversation: ChatConversation
  messages: ChatMessage[]
  customerProfile: Profile | null
  agents: Profile[]
}

const SEARCH_DEFAULT_LIMIT = 50
const SEARCH_MAX_LIMIT = 100
const MESSAGES_PAGE = 200

interface CursorPayload {
  last_customer_message_at: string
  id: string
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodeCursor(input: string | null | undefined): CursorPayload | null {
  if (!input) return null
  try {
    const json = Buffer.from(input, 'base64url').toString('utf8')
    const parsed: unknown = JSON.parse(json)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'last_customer_message_at' in parsed &&
      'id' in parsed
    ) {
      const obj = parsed as Record<string, unknown>
      if (
        typeof obj.last_customer_message_at === 'string' &&
        typeof obj.id === 'string'
      ) {
        return {
          last_customer_message_at: obj.last_customer_message_at,
          id: obj.id,
        }
      }
    }
    return null
  } catch {
    return null
  }
}

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return SEARCH_DEFAULT_LIMIT
  return Math.min(SEARCH_MAX_LIMIT, Math.max(1, Math.floor(limit)))
}

async function requireSupportOrAdmin(): Promise<Profile> {
  const profile = await getOrCreateProfile()
  if (!profile) {
    throw new SupportActionError('unauthorized', 'No authenticated profile', 401)
  }
  if (profile.role !== 'support' && profile.role !== 'admin') {
    throw new SupportActionError(
      'forbidden',
      `Role '${profile.role}' is not permitted on this surface`,
      403
    )
  }
  return profile
}

function customerLabelOf(row: ChatConversation): string | null {
  return row.visitor_name || row.visitor_email || row.visitor_phone || null
}

function isUnreadForAgent(row: ChatConversation): boolean {
  // If the customer's last message is newer than the agent's last, the row
  // is "unread" for the assigned agent. Conservative: when no agent message
  // exists yet but a customer message does, treat it as unread.
  const cust = row.last_customer_message_at
    ? Date.parse(row.last_customer_message_at)
    : 0
  const agent = row.last_agent_message_at
    ? Date.parse(row.last_agent_message_at)
    : 0
  return cust > agent
}

function channelOf(row: ChatConversation): InboxChannel {
  const ch = row.metadata && typeof row.metadata === 'object'
    ? (row.metadata as Record<string, unknown>).channel
    : null
  if (ch === 'email' || ch === 'in_app' || ch === 'widget') return ch
  return 'widget'
}

// ============================================================
// searchInbox — left-rail list
// ============================================================

export async function searchInbox(
  input: SearchInboxInput
): Promise<SearchInboxResult> {
  const actor = await requireSupportOrAdmin()
  const limit = clampLimit(input.limit)
  const cursor = decodeCursor(input.cursor)
  const db = createSupabaseAdminClient()

  const statuses: InboxStatus[] = Array.isArray(input.status)
    ? input.status
    : input.status
      ? [input.status]
      : ['open']

  let qb = db
    .from('chat_conversations')
    .select('*', { count: 'exact' })
    .in('inbox_status', statuses)
    .order('last_customer_message_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  if (input.assignment === 'mine') {
    qb = qb.eq('assigned_to', actor.id)
  } else if (input.assignment === 'unassigned') {
    qb = qb.is('assigned_to', null)
  }

  if (cursor) {
    qb = qb.or(
      `last_customer_message_at.lt.${cursor.last_customer_message_at},and(last_customer_message_at.eq.${cursor.last_customer_message_at},id.lt.${cursor.id})`
    )
  }

  const { data, error, count } = await qb
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to load inbox: ${error.message}`,
      500
    )
  }

  const rows = (data ?? []) as ChatConversation[]
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  // Channel filter: applied client-side since channel lives in metadata. This
  // is acceptable because the channel filter narrows after the page has been
  // pulled — we trade exactness for ordering simplicity. Phase 6 can promote
  // channel to a column if the filter becomes load-bearing.
  const filtered = input.channel
    ? page.filter((r) => channelOf(r) === input.channel)
    : page

  const conversations: InboxRow[] = filtered.map((row) => ({
    ...row,
    customer_label: customerLabelOf(row),
    unread_for_agent: isUnreadForAgent(row),
  }))

  const nextCursor =
    hasMore && page.length > 0
      ? encodeCursor({
          last_customer_message_at:
            page[page.length - 1].last_customer_message_at ??
            page[page.length - 1].created_at,
          id: page[page.length - 1].id,
        })
      : null

  return { conversations, nextCursor, total: count ?? conversations.length }
}

// ============================================================
// getConversationBundle — right-pane payload
// ============================================================

export async function getConversationBundle(
  conversationId: string
): Promise<ConversationBundle> {
  await requireSupportOrAdmin()
  const db = createSupabaseAdminClient()

  const { data: conv, error: convErr } = await db
    .from('chat_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle()
  if (convErr) {
    throw new SupportActionError('db_error', convErr.message, 500)
  }
  if (!conv) {
    throw new SupportActionError('not_found', 'Conversation not found', 404)
  }
  const conversation = conv as ChatConversation

  const { data: msgs, error: msgErr } = await db
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(MESSAGES_PAGE)
  if (msgErr) {
    throw new SupportActionError('db_error', msgErr.message, 500)
  }
  const messages = (msgs ?? []) as ChatMessage[]

  // Customer profile: visitor_email -> profiles.email
  let customerProfile: Profile | null = null
  if (conversation.visitor_email) {
    const { data: prof } = await db
      .from('profiles')
      .select('*')
      .eq('email', conversation.visitor_email.toLowerCase())
      .maybeSingle()
    customerProfile = (prof as Profile | null) ?? null
  }

  // Agent roster (for assignment combobox)
  const { data: agentsData } = await db
    .from('profiles')
    .select('*')
    .in('role', ['support', 'admin'])
    .eq('status', 'active')
    .order('full_name', { ascending: true })
    .limit(200)
  const agents = (agentsData ?? []) as Profile[]

  return { conversation, messages, customerProfile, agents }
}

// ============================================================
// Mutations
// ============================================================

async function loadConversation(
  db: ReturnType<typeof createSupabaseAdminClient>,
  conversationId: string
): Promise<ChatConversation> {
  const { data, error } = await db
    .from('chat_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle()
  if (error) {
    throw new SupportActionError('db_error', error.message, 500)
  }
  if (!data) {
    throw new SupportActionError('not_found', 'Conversation not found', 404)
  }
  return data as ChatConversation
}

export async function takeConversation(input: {
  conversationId: string
}): Promise<ChatConversation> {
  const actor = await requireSupportOrAdmin()
  const db = createSupabaseAdminClient()
  await loadConversation(db, input.conversationId)
  const { data, error } = await db
    .from('chat_conversations')
    .update({
      assigned_to: actor.id,
      assigned_at: new Date().toISOString(),
    })
    .eq('id', input.conversationId)
    .select('*')
    .single()
  if (error || !data) {
    throw new SupportActionError(
      'db_error',
      `Failed to take conversation: ${error?.message ?? 'unknown'}`,
      500
    )
  }
  await logSupportAction({
    action: 'inbox.take',
    targetType: 'conversation',
    targetId: input.conversationId,
  })
  return data as ChatConversation
}

export async function releaseConversation(input: {
  conversationId: string
}): Promise<ChatConversation> {
  await requireSupportOrAdmin()
  const db = createSupabaseAdminClient()
  await loadConversation(db, input.conversationId)
  const { data, error } = await db
    .from('chat_conversations')
    .update({
      assigned_to: null,
      assigned_at: null,
    })
    .eq('id', input.conversationId)
    .select('*')
    .single()
  if (error || !data) {
    throw new SupportActionError(
      'db_error',
      `Failed to release conversation: ${error?.message ?? 'unknown'}`,
      500
    )
  }
  await logSupportAction({
    action: 'inbox.release',
    targetType: 'conversation',
    targetId: input.conversationId,
  })
  return data as ChatConversation
}

export async function assignConversation(input: {
  conversationId: string
  toProfileId: string | null
}): Promise<ChatConversation> {
  const actor = await requireSupportOrAdmin()
  const db = createSupabaseAdminClient()
  await loadConversation(db, input.conversationId)

  if (input.toProfileId) {
    const { data: target } = await db
      .from('profiles')
      .select('id, role, status')
      .eq('id', input.toProfileId)
      .maybeSingle()
    const t = target as { id: string; role: string; status: string } | null
    if (!t) {
      throw new SupportActionError('not_found', 'Target agent not found', 404)
    }
    if (!['support', 'admin'].includes(t.role) || t.status !== 'active') {
      throw new SupportActionError(
        'invalid_input',
        'Target must be an active support|admin profile',
        400
      )
    }
  }

  const { data, error } = await db
    .from('chat_conversations')
    .update({
      assigned_to: input.toProfileId,
      assigned_at: input.toProfileId ? new Date().toISOString() : null,
    })
    .eq('id', input.conversationId)
    .select('*')
    .single()
  if (error || !data) {
    throw new SupportActionError(
      'db_error',
      `Failed to assign conversation: ${error?.message ?? 'unknown'}`,
      500
    )
  }

  await logSupportAction({
    action: 'inbox.assign',
    targetType: 'conversation',
    targetId: input.conversationId,
    metadata: {
      to_profile_id: input.toProfileId,
      from_actor_id: actor.id,
    },
  })
  return data as ChatConversation
}

export async function setConversationStatus(input: {
  conversationId: string
  status: InboxStatus
  snoozedUntil?: string | null
}): Promise<ChatConversation> {
  await requireSupportOrAdmin()
  if (!['open', 'snoozed', 'resolved'].includes(input.status)) {
    throw new SupportActionError('invalid_input', 'Invalid status', 400)
  }
  if (input.status === 'snoozed' && !input.snoozedUntil) {
    throw new SupportActionError(
      'invalid_input',
      'snoozedUntil required when status=snoozed',
      400
    )
  }
  const db = createSupabaseAdminClient()
  await loadConversation(db, input.conversationId)

  const patch: Record<string, unknown> = {
    inbox_status: input.status,
    snoozed_until: input.status === 'snoozed' ? input.snoozedUntil : null,
  }

  const { data, error } = await db
    .from('chat_conversations')
    .update(patch)
    .eq('id', input.conversationId)
    .select('*')
    .single()
  if (error || !data) {
    throw new SupportActionError(
      'db_error',
      `Failed to set conversation status: ${error?.message ?? 'unknown'}`,
      500
    )
  }
  await logSupportAction({
    action: 'inbox.set_status',
    targetType: 'conversation',
    targetId: input.conversationId,
    metadata: {
      status: input.status,
      snoozed_until: input.snoozedUntil ?? null,
    },
  })
  return data as ChatConversation
}

export async function postSupportMessage(input: {
  conversationId: string
  body: string
  macroId?: string | null
}): Promise<ChatMessage> {
  const actor = await requireSupportOrAdmin()
  const db = createSupabaseAdminClient()
  const conv = await loadConversation(db, input.conversationId)

  const raw = (input.body ?? '').trim()
  if (!raw && !input.macroId) {
    throw new SupportActionError('invalid_input', 'body is required', 400)
  }

  let finalBody = raw
  if (input.macroId) {
    const macro = await getMacroById(input.macroId)
    type CustomerStub = { id: string; email: string; full_name: string | null }
    let customerProfile: CustomerStub | null = null
    if (conv.visitor_email) {
      const { data: prof } = await db
        .from('profiles')
        .select('id, email, full_name')
        .eq('email', conv.visitor_email.toLowerCase())
        .maybeSingle()
      customerProfile = (prof as CustomerStub | null) ?? null
    }
    const customerFullName = customerProfile?.full_name ?? conv.visitor_name ?? null
    const [firstName, ...rest] = (customerFullName ?? '').split(/\s+/).filter(Boolean)
    const ctx: RenderContext = {
      customer: {
        first_name: firstName ?? null,
        last_name: rest.join(' ') || null,
        full_name: customerFullName,
        email: customerProfile?.email ?? conv.visitor_email ?? null,
      },
      order: null,
      agent: {
        name: actor.full_name,
        email: actor.email,
      },
    }
    const rendered = await renderMacroBody(macro.body, ctx)
    finalBody = raw ? `${rendered}\n\n${raw}` : rendered
  }

  const trimmed = finalBody.slice(0, 8000)
  const now = new Date().toISOString()

  const agentName = actor.full_name || actor.email || 'Yousafe Support'
  const { data: msg, error: msgErr } = await db
    .from('chat_messages')
    .insert({
      conversation_id: input.conversationId,
      sender_type: 'agent',
      sender_id: actor.id,
      sender_name: agentName,
      body: trimmed,
      metadata: input.macroId ? { macro_id: input.macroId } : {},
    })
    .select('*')
    .single()
  if (msgErr || !msg) {
    throw new SupportActionError(
      'db_error',
      `Failed to insert message: ${msgErr?.message ?? 'unknown'}`,
      500
    )
  }

  const convPatch: Record<string, unknown> = {
    last_agent_message_at: now,
    last_message: trimmed.slice(0, 280),
    last_message_at: now,
  }
  // If the agent replies and isn't assigned yet, auto-claim the row.
  if (!conv.assigned_to) {
    convPatch.assigned_to = actor.id
    convPatch.assigned_at = now
  }
  // If the agent replies to a resolved/snoozed row, reopen it.
  if (conv.inbox_status !== 'open') {
    convPatch.inbox_status = 'open'
    convPatch.snoozed_until = null
  }
  const { error: updErr } = await db
    .from('chat_conversations')
    .update(convPatch)
    .eq('id', input.conversationId)
  if (updErr) {
    throw new SupportActionError(
      'db_error',
      `Failed to update conversation timestamps: ${updErr.message}`,
      500
    )
  }

  await logSupportAction({
    action: 'inbox.message',
    targetType: 'conversation',
    targetId: input.conversationId,
    metadata: {
      macro_id: input.macroId ?? null,
      body_len: trimmed.length,
    },
  })

  return msg as ChatMessage
}
