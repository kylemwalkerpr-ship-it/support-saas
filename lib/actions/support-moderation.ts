'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import {
  logSupportAction,
  SupportActionError,
} from '@/lib/actions/support-audit'
import { suspendUser } from '@/lib/actions/support-users'
import type {
  ModerationCategory,
  ModerationFlag,
  ModerationStatus,
  ModerationTargetType,
  Profile,
} from '@/lib/types'

// ============================================================
// Phase 7 — Content moderation: triage queue, decisions, system flags
// ============================================================

const SEARCH_DEFAULT_LIMIT = 30
const SEARCH_MAX_LIMIT = 100
const NOTES_MIN = 12
const REASON_MIN = 8

const VALID_TARGET_TYPES: ModerationTargetType[] = [
  'gig',
  'message',
  'review',
  'profile',
]
const VALID_CATEGORIES: ModerationCategory[] = [
  'spam',
  'abuse',
  'scam',
  'duplicate',
  'other',
]

// ─── inputs / outputs ────────────────────────────────────────

export interface SearchFlagsInput {
  target_type?: ModerationTargetType
  status?: ModerationStatus[]
  category?: ModerationCategory[]
  cursor?: string | null
  limit?: number
}

export interface ModerationFlagRow extends ModerationFlag {
  flagger_label: string | null
  target_excerpt: string | null
}

export interface SearchFlagsResult {
  rows: ModerationFlagRow[]
  nextCursor: string | null
  total: number
}

export interface GigSnapshot {
  id: string
  title: string | null
  description: string | null
  seller_id: string | null
  is_hidden: boolean | null
  created_at: string | null
}

export interface ReviewSnapshot {
  id: string
  rating: number | null
  body: string | null
  reviewer_id: string | null
  gig_id: string | null
  is_hidden: boolean | null
  created_at: string | null
}

export interface MessageSnapshot {
  id: string
  source_table: 'conversation_messages' | 'chat_messages'
  conversation_id: string | null
  sender_id: string | null
  sender_label: string | null
  body: string | null
  is_hidden: boolean | null
  created_at: string | null
  context: Array<{
    id: string
    sender_label: string | null
    body: string | null
    created_at: string | null
  }>
}

export interface ProfileSnapshot {
  id: string
  full_name: string | null
  email: string | null
  bio: string | null
  role: string | null
  status: string | null
  is_hidden: boolean | null
  created_at: string | null
}

export interface FlagBundle {
  flag: ModerationFlag
  flagger: { id: string; label: string } | null
  target_type: ModerationTargetType
  target_id: string
  // Only one of these is populated, matching the flag's target_type.
  gig: GigSnapshot | null
  review: ReviewSnapshot | null
  message: MessageSnapshot | null
  profile: ProfileSnapshot | null
  target_missing: boolean
}

export type ModerationDecisionAction =
  | 'dismiss'
  | 'hide'
  | 'warn_user'
  | 'suspend_user'

export interface DecideFlagInput {
  flagId: string
  decision: ModerationDecisionAction
  notes?: string
  // Required for warn_user + suspend_user. Ignored otherwise.
  userId?: string
}

export interface CreateSystemFlagInput {
  target_type: ModerationTargetType
  target_id: string
  reason: string
  category: ModerationCategory
}

// ─── helpers ─────────────────────────────────────────────────

interface CursorPayload {
  created_at: string
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
      'created_at' in parsed &&
      'id' in parsed
    ) {
      const obj = parsed as Record<string, unknown>
      if (
        typeof obj.created_at === 'string' &&
        typeof obj.id === 'string'
      ) {
        return { created_at: obj.created_at, id: obj.id }
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
    throw new SupportActionError(
      'unauthorized',
      'No authenticated profile',
      401
    )
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

async function requireAdmin(): Promise<Profile> {
  const actor = await requireSupportOrAdmin()
  if (actor.role !== 'admin') {
    throw new SupportActionError(
      'forbidden',
      'Only admins can perform this action',
      403
    )
  }
  return actor
}

function truncateExcerpt(value: string | null, max = 120): string | null {
  if (!value) return null
  const t = value.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

// ============================================================
// Target loaders (per target_type). All defensive — a flag may
// reference a row that has since been deleted; we report it via
// target_missing rather than throwing.
// ============================================================

type AdminClient = ReturnType<typeof createSupabaseAdminClient>

async function loadGigSnapshot(
  db: AdminClient,
  id: string
): Promise<GigSnapshot | null> {
  const { data } = await db
    .from('gigs')
    .select('id, title, description, seller_id, is_hidden, created_at')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const row = data as {
    id: string
    title: string | null
    description: string | null
    seller_id: string | null
    is_hidden: boolean | null
    created_at: string | null
  }
  return row
}

async function loadReviewSnapshot(
  db: AdminClient,
  id: string
): Promise<ReviewSnapshot | null> {
  const { data } = await db
    .from('gig_reviews')
    .select('id, rating, body, reviewer_id, gig_id, is_hidden, created_at')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const row = data as {
    id: string
    rating: number | null
    body: string | null
    reviewer_id: string | null
    gig_id: string | null
    is_hidden: boolean | null
    created_at: string | null
  }
  return row
}

async function loadProfileSnapshot(
  db: AdminClient,
  id: string
): Promise<ProfileSnapshot | null> {
  const { data } = await db
    .from('profiles')
    .select(
      'id, full_name, email, bio, role, status, is_hidden, created_at'
    )
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const row = data as {
    id: string
    full_name: string | null
    email: string | null
    bio: string | null
    role: string | null
    status: string | null
    is_hidden: boolean | null
    created_at: string | null
  }
  return row
}

interface RawMessageRow {
  id: string
  conversation_id: string | null
  sender_id: string | null
  body: string | null
  is_hidden: boolean | null
  created_at: string | null
}

async function loadMessageSnapshot(
  db: AdminClient,
  id: string
): Promise<MessageSnapshot | null> {
  // Try the portal in-platform DM table first.
  let source: 'conversation_messages' | 'chat_messages' = 'conversation_messages'
  let row: RawMessageRow | null = null
  {
    const { data } = await db
      .from('conversation_messages')
      .select('id, conversation_id, sender_id, body, is_hidden, created_at')
      .eq('id', id)
      .maybeSingle()
    if (data) row = data as RawMessageRow
  }
  if (!row) {
    // Fall back to widget chat_messages.
    const { data } = await db
      .from('chat_messages')
      .select('id, conversation_id, sender_id, body, is_hidden, created_at')
      .eq('id', id)
      .maybeSingle()
    if (data) {
      source = 'chat_messages'
      row = data as RawMessageRow
    }
  }
  if (!row) return null

  // Resolve sender label.
  let sender_label: string | null = null
  if (row.sender_id) {
    const { data: prof } = await db
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', row.sender_id)
      .maybeSingle()
    const p = prof as { full_name: string | null; email: string } | null
    if (p) sender_label = p.full_name ?? p.email
  }

  // Load the preceding 2 messages in the same conversation for context.
  let context: MessageSnapshot['context'] = []
  if (row.conversation_id) {
    const { data: prev } = await db
      .from(source)
      .select('id, sender_id, body, created_at')
      .eq('conversation_id', row.conversation_id)
      .lt('created_at', row.created_at ?? new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(2)

    const prevRows = (prev ?? []) as Array<{
      id: string
      sender_id: string | null
      body: string | null
      created_at: string | null
    }>
    const senderIds = Array.from(
      new Set(prevRows.map((r) => r.sender_id).filter((s): s is string => !!s))
    )
    const labelMap = new Map<string, string>()
    if (senderIds.length > 0) {
      const { data: profs } = await db
        .from('profiles')
        .select('id, full_name, email')
        .in('id', senderIds)
      for (const p of (profs ?? []) as Array<{
        id: string
        full_name: string | null
        email: string
      }>) {
        labelMap.set(p.id, p.full_name ?? p.email)
      }
    }
    // Oldest-first ordering for display.
    context = prevRows
      .slice()
      .reverse()
      .map((r) => ({
        id: r.id,
        sender_label: r.sender_id ? labelMap.get(r.sender_id) ?? null : null,
        body: r.body,
        created_at: r.created_at,
      }))
  }

  return {
    id: row.id,
    source_table: source,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    sender_label,
    body: row.body,
    is_hidden: row.is_hidden,
    created_at: row.created_at,
    context,
  }
}

async function targetExcerptFor(
  db: AdminClient,
  target_type: ModerationTargetType,
  target_id: string
): Promise<string | null> {
  switch (target_type) {
    case 'gig': {
      const snap = await loadGigSnapshot(db, target_id)
      return truncateExcerpt(snap?.title ?? snap?.description ?? null)
    }
    case 'review': {
      const snap = await loadReviewSnapshot(db, target_id)
      return truncateExcerpt(snap?.body ?? null)
    }
    case 'message': {
      const snap = await loadMessageSnapshot(db, target_id)
      return truncateExcerpt(snap?.body ?? null)
    }
    case 'profile': {
      const snap = await loadProfileSnapshot(db, target_id)
      return truncateExcerpt(snap?.full_name ?? snap?.email ?? snap?.bio ?? null)
    }
    default:
      return null
  }
}

// ============================================================
// searchFlags — queue listing
// ============================================================

export async function searchFlags(
  input: SearchFlagsInput
): Promise<SearchFlagsResult> {
  await requireSupportOrAdmin()
  const limit = clampLimit(input.limit)
  const cursor = decodeCursor(input.cursor)
  const statuses =
    input.status && input.status.length > 0
      ? input.status
      : (['pending'] as ModerationStatus[])
  const categories =
    input.category && input.category.length > 0 ? input.category : null

  const db = createSupabaseAdminClient()
  let qb = db
    .from('moderation_flags')
    .select('*', { count: 'exact' })
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  if (input.target_type) qb = qb.eq('target_type', input.target_type)
  if (categories) qb = qb.in('category', categories)

  if (cursor) {
    // DESC pagination: keep rows older than the cursor.
    qb = qb.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
    )
  }

  const { data, error, count } = await qb
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to list flags: ${error.message}`,
      500
    )
  }

  const flags = (data ?? []) as ModerationFlag[]
  const hasMore = flags.length > limit
  const page = hasMore ? flags.slice(0, limit) : flags

  // Resolve flagger labels in batch.
  const flaggerIds = Array.from(
    new Set(page.map((f) => f.flagger_id).filter((x): x is string => !!x))
  )
  const flaggerLabels = new Map<string, string>()
  if (flaggerIds.length > 0) {
    const { data: profs } = await db
      .from('profiles')
      .select('id, full_name, email')
      .in('id', flaggerIds)
    for (const p of (profs ?? []) as Array<{
      id: string
      full_name: string | null
      email: string
    }>) {
      flaggerLabels.set(p.id, p.full_name ?? p.email)
    }
  }

  // Compute excerpts in parallel — bounded by page size (default 30).
  const excerpts = await Promise.all(
    page.map((f) =>
      targetExcerptFor(db, f.target_type, f.target_id).catch(() => null)
    )
  )

  const rows: ModerationFlagRow[] = page.map((f, i) => ({
    ...f,
    flagger_label: f.flagger_id ? flaggerLabels.get(f.flagger_id) ?? null : null,
    target_excerpt: excerpts[i],
  }))

  const last = page[page.length - 1]
  const nextCursor =
    hasMore && last ? encodeCursor({ created_at: last.created_at, id: last.id }) : null

  return { rows, nextCursor, total: count ?? rows.length }
}

// ============================================================
// getFlagBundle — single flag with full target content
// ============================================================

async function loadFlag(
  db: AdminClient,
  flagId: string
): Promise<ModerationFlag> {
  const { data, error } = await db
    .from('moderation_flags')
    .select('*')
    .eq('id', flagId)
    .maybeSingle()
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to load flag: ${error.message}`,
      500
    )
  }
  if (!data) {
    throw new SupportActionError('not_found', 'Flag not found', 404)
  }
  return data as ModerationFlag
}

export async function getFlagBundle(flagId: string): Promise<FlagBundle> {
  await requireSupportOrAdmin()
  const db = createSupabaseAdminClient()
  const flag = await loadFlag(db, flagId)

  let gig: GigSnapshot | null = null
  let review: ReviewSnapshot | null = null
  let message: MessageSnapshot | null = null
  let profile: ProfileSnapshot | null = null

  switch (flag.target_type) {
    case 'gig':
      gig = await loadGigSnapshot(db, flag.target_id)
      break
    case 'review':
      review = await loadReviewSnapshot(db, flag.target_id)
      break
    case 'message':
      message = await loadMessageSnapshot(db, flag.target_id)
      break
    case 'profile':
      profile = await loadProfileSnapshot(db, flag.target_id)
      break
  }

  const target_missing =
    !gig && !review && !message && !profile

  // Flagger label.
  let flagger: FlagBundle['flagger'] = null
  if (flag.flagger_id) {
    const { data: p } = await db
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', flag.flagger_id)
      .maybeSingle()
    const prof = p as {
      id: string
      full_name: string | null
      email: string
    } | null
    if (prof) {
      flagger = { id: prof.id, label: prof.full_name ?? prof.email }
    }
  }

  return {
    flag,
    flagger,
    target_type: flag.target_type,
    target_id: flag.target_id,
    gig,
    review,
    message,
    profile,
    target_missing,
  }
}

// ============================================================
// hideTargetContent — internal helper: flips is_hidden on the
// portal-owned table matching the flag's target_type.
// ============================================================

interface HideTargetInput {
  target_type: ModerationTargetType
  target_id: string
  actorId: string
}

export async function hideTargetContent(input: HideTargetInput): Promise<void> {
  await requireSupportOrAdmin()
  const db = createSupabaseAdminClient()
  await hideTargetContentInternal(db, input)
}

async function hideTargetContentInternal(
  db: AdminClient,
  input: HideTargetInput
): Promise<void> {
  const now = new Date().toISOString()
  const patch = {
    is_hidden: true,
    hidden_at: now,
    hidden_by_actor_id: input.actorId,
  }
  let table: string
  if (input.target_type === 'gig') table = 'gigs'
  else if (input.target_type === 'review') table = 'gig_reviews'
  else if (input.target_type === 'profile') table = 'profiles'
  else if (input.target_type === 'message') {
    // Try conversation_messages first, then chat_messages.
    const tryConv = await db
      .from('conversation_messages')
      .update(patch)
      .eq('id', input.target_id)
      .select('id')
      .maybeSingle()
    if (tryConv.data) return
    const tryChat = await db
      .from('chat_messages')
      .update(patch)
      .eq('id', input.target_id)
      .select('id')
      .maybeSingle()
    if (tryChat.data) return
    throw new SupportActionError(
      'not_found',
      'Message target row not found in conversation_messages or chat_messages',
      404
    )
  } else {
    throw new SupportActionError(
      'invalid_input',
      `Unsupported target_type: ${input.target_type as string}`,
      400
    )
  }

  const { data, error } = await db
    .from(table)
    .update(patch)
    .eq('id', input.target_id)
    .select('id')
    .maybeSingle()
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to hide ${input.target_type}: ${error.message}`,
      500
    )
  }
  if (!data) {
    throw new SupportActionError(
      'not_found',
      `${input.target_type} target row not found`,
      404
    )
  }
}

// ============================================================
// decideFlag — dispatch on decision type
// ============================================================

export interface DecideFlagResult {
  flag: ModerationFlag
}

async function markFlagDecided(
  db: AdminClient,
  flagId: string,
  actorId: string,
  status: 'dismissed' | 'actioned'
): Promise<ModerationFlag> {
  const { data, error } = await db
    .from('moderation_flags')
    .update({
      status,
      decided_by: actorId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', flagId)
    .select('*')
    .single()
  if (error || !data) {
    throw new SupportActionError(
      'db_error',
      `Failed to update flag: ${error?.message ?? 'unknown'}`,
      500
    )
  }
  return data as ModerationFlag
}

export async function decideFlag(
  input: DecideFlagInput
): Promise<DecideFlagResult> {
  const actor = await requireSupportOrAdmin()
  const db = createSupabaseAdminClient()
  const flag = await loadFlag(db, input.flagId)

  if (flag.status !== 'pending') {
    throw new SupportActionError(
      'invalid_state',
      `Flag is ${flag.status}; cannot decide again`,
      409
    )
  }

  const notes = (input.notes ?? '').trim()
  const requiresNotes =
    input.decision === 'hide' ||
    input.decision === 'warn_user' ||
    input.decision === 'suspend_user'
  if (requiresNotes && notes.length < NOTES_MIN) {
    throw new SupportActionError(
      'invalid_input',
      `notes must be at least ${NOTES_MIN} characters`,
      400
    )
  }

  // ── dismiss ────────────────────────────────────────────────
  if (input.decision === 'dismiss') {
    const updated = await markFlagDecided(db, flag.id, actor.id, 'dismissed')
    await logSupportAction({
      action: 'moderation.dismiss',
      targetType: 'moderation_flag',
      targetId: flag.id,
      reason: notes || undefined,
      metadata: {
        target_type: flag.target_type,
        target_id: flag.target_id,
        category: flag.category,
      },
    })
    return { flag: updated }
  }

  // ── hide ───────────────────────────────────────────────────
  if (input.decision === 'hide') {
    await hideTargetContentInternal(db, {
      target_type: flag.target_type,
      target_id: flag.target_id,
      actorId: actor.id,
    })
    const updated = await markFlagDecided(db, flag.id, actor.id, 'actioned')
    await logSupportAction({
      action: 'moderation.hide',
      targetType: 'moderation_flag',
      targetId: flag.id,
      reason: notes,
      metadata: {
        target_type: flag.target_type,
        target_id: flag.target_id,
        category: flag.category,
      },
    })
    return { flag: updated }
  }

  // ── warn_user ─────────────────────────────────────────────
  if (input.decision === 'warn_user') {
    if (!input.userId) {
      throw new SupportActionError(
        'invalid_input',
        'userId is required for warn_user',
        400
      )
    }
    const { error: notifyErr } = await db.rpc('support_notify', {
      recipient_id: input.userId,
      type: 'system',
      subject_type: flag.target_type,
      subject_id: flag.target_id,
      title: 'Content policy warning',
      body: notes,
    })
    if (notifyErr) {
      throw new SupportActionError(
        'notify_failed',
        `Failed to post warning notification: ${notifyErr.message}`,
        500
      )
    }
    const updated = await markFlagDecided(db, flag.id, actor.id, 'actioned')
    await logSupportAction({
      action: 'moderation.warn_user',
      targetType: 'moderation_flag',
      targetId: flag.id,
      reason: notes,
      metadata: {
        target_type: flag.target_type,
        target_id: flag.target_id,
        category: flag.category,
        warned_user_id: input.userId,
      },
    })
    return { flag: updated }
  }

  // ── suspend_user ──────────────────────────────────────────
  if (input.decision === 'suspend_user') {
    if (!input.userId) {
      throw new SupportActionError(
        'invalid_input',
        'userId is required for suspend_user',
        400
      )
    }
    // suspendUser enforces its own role check and minimum-reason length
    // (SUSPEND_REASON_MIN). We pass the moderation notes through.
    await suspendUser({ profileId: input.userId, reason: notes })
    const updated = await markFlagDecided(db, flag.id, actor.id, 'actioned')
    await logSupportAction({
      action: 'moderation.suspend_user',
      targetType: 'moderation_flag',
      targetId: flag.id,
      reason: notes,
      metadata: {
        target_type: flag.target_type,
        target_id: flag.target_id,
        category: flag.category,
        suspended_user_id: input.userId,
      },
    })
    return { flag: updated }
  }

  throw new SupportActionError(
    'invalid_input',
    `Unknown decision: ${input.decision as string}`,
    400
  )
}

// ============================================================
// createSystemFlag — admin-only manual flag entry
// ============================================================

export async function createSystemFlag(
  input: CreateSystemFlagInput
): Promise<ModerationFlag> {
  // System flags carry no flagger_id. We restrict creation to admin so the
  // manual "system" channel can't be impersonated by a single support agent.
  await requireAdmin()

  if (!VALID_TARGET_TYPES.includes(input.target_type)) {
    throw new SupportActionError('invalid_input', 'Invalid target_type', 400)
  }
  if (!VALID_CATEGORIES.includes(input.category)) {
    throw new SupportActionError('invalid_input', 'Invalid category', 400)
  }
  const target_id = (input.target_id ?? '').trim()
  if (!target_id) {
    throw new SupportActionError('invalid_input', 'target_id is required', 400)
  }
  const reason = (input.reason ?? '').trim()
  if (reason.length < REASON_MIN) {
    throw new SupportActionError(
      'invalid_input',
      `reason must be at least ${REASON_MIN} characters`,
      400
    )
  }

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from('moderation_flags')
    .insert({
      flagger_id: null,
      target_type: input.target_type,
      target_id,
      reason: reason.slice(0, 4000),
      category: input.category,
      status: 'pending',
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new SupportActionError(
      'db_error',
      `Failed to create flag: ${error?.message ?? 'unknown'}`,
      500
    )
  }
  const flag = data as ModerationFlag

  await logSupportAction({
    action: 'moderation.create_system_flag',
    targetType: 'moderation_flag',
    targetId: flag.id,
    reason,
    metadata: {
      target_type: input.target_type,
      target_id,
      category: input.category,
    },
  })

  return flag
}

