'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import {
  logSupportAction,
} from '@/lib/actions/support-audit'
import { SupportActionError } from '@/lib/errors'
import { requireCan } from '@/lib/rbac'
import type {
  Profile,
  Role,
  ProfileStatus,
  SupportAuditLogEntry,
  ChatConversation,
} from '@/lib/types'

// ============================================================
// Types — Phase 2 user directory + 360
// ============================================================

export interface SearchUsersInput {
  q?: string
  role?: Role[]
  status?: ProfileStatus[]
  cursor?: string | null
  limit?: number
}

export interface UserDirectoryRow extends Profile {
  order_count: number
  last_seen_at: string | null
}

export interface SearchUsersResult {
  users: UserDirectoryRow[]
  nextCursor: string | null
  total: number
}

export interface PortalOrderRow {
  id: string
  order_number: string | null
  status: string | null
  total_amount: number | null
  gateway: string | null
  created_at: string
  updated_at: string | null
  client_id: string | null
  consultant_id: string | null
}

export interface PortalWalletSnapshot {
  profile_id: string
  balance_cents: number
  currency: string
  updated_at: string | null
}

export interface SupportUserNote {
  id: string
  actor_id: string
  profile_id: string
  body: string
  created_at: string
}

export interface User360Bundle {
  profile: Profile
  orders: PortalOrderRow[]
  wallet: PortalWalletSnapshot | null
  conversations: ChatConversation[]
  audit: SupportAuditLogEntry[]
  notes: SupportUserNote[]
}

// ============================================================
// Internal helpers
// ============================================================

const SEARCH_DEFAULT_LIMIT = 30
const SEARCH_MAX_LIMIT = 100
const SEARCH_QUERY_MAX = 64
const SUSPEND_REASON_MIN = 12
const NOTE_BODY_MIN = 4

const ALL_ROLES: Role[] = ['client', 'consultant', 'support', 'admin']
const ALL_STATUSES: ProfileStatus[] = ['active', 'pending', 'suspended']

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
      'id' in parsed &&
      typeof (parsed as Record<string, unknown>).created_at === 'string' &&
      typeof (parsed as Record<string, unknown>).id === 'string'
    ) {
      return parsed as CursorPayload
    }
    return null
  } catch {
    return null
  }
}

function sanitizeRoles(input: Role[] | undefined): Role[] {
  if (!input || input.length === 0) return ALL_ROLES
  return input.filter((r): r is Role => ALL_ROLES.includes(r))
}

function sanitizeStatuses(input: ProfileStatus[] | undefined): ProfileStatus[] {
  if (!input || input.length === 0) return ALL_STATUSES
  return input.filter((s): s is ProfileStatus => ALL_STATUSES.includes(s))
}

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return SEARCH_DEFAULT_LIMIT
  return Math.min(SEARCH_MAX_LIMIT, Math.max(1, Math.floor(limit)))
}

function escapeIlike(input: string): string {
  // Strip percent / underscore so an attacker cannot widen the LIKE pattern,
  // and PostgREST `or` strings treat `,` / `(` / `)` as separators.
  return input.replace(/[%_,()]/g, '')
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

async function loadTargetProfile(
  db: ReturnType<typeof createSupabaseAdminClient>,
  profileId: string
): Promise<Profile> {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .maybeSingle()

  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to load target profile: ${error.message}`,
      500
    )
  }
  if (!data) {
    throw new SupportActionError('not_found', 'Target profile not found', 404)
  }
  return data as Profile
}

function assertSupportCanActOnTarget(
  actor: Profile,
  target: Profile,
  action: 'user.suspend' | 'user.reactivate'
) {
  // Delegate to the central RBAC layer. We re-throw with the
  // legacy `forbidden_target` code so existing call sites and
  // dialog copy don't shift semantics.
  try {
    requireCan(actor, action, { targetRole: target.role })
  } catch {
    throw new SupportActionError(
      'forbidden_target',
      'Support agents cannot modify other support or admin accounts',
      403
    )
  }
}

// ============================================================
// searchUsers — directory query
// ============================================================

export async function searchUsers(
  input: SearchUsersInput
): Promise<SearchUsersResult> {
  await requireSupportOrAdmin()

  const limit = clampLimit(input.limit)
  const roles = sanitizeRoles(input.role)
  const statuses = sanitizeStatuses(input.status)
  const rawQ = (input.q ?? '').trim().slice(0, SEARCH_QUERY_MAX)
  const cursor = decodeCursor(input.cursor)

  const db = createSupabaseAdminClient()

  let qb = db
    .from('profiles')
    .select(
      'id, clerk_user_id, email, full_name, avatar_url, role, status, bio, created_at, updated_at',
      { count: 'exact' }
    )
    .in('role', roles)
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1) // fetch one extra to compute nextCursor

  if (rawQ) {
    const safe = escapeIlike(rawQ)
    if (safe) {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safe)
      const parts = [
        `full_name.ilike.%${safe}%`,
        `email.ilike.%${safe}%`,
      ]
      if (isUuid) parts.push(`id.eq.${safe}`)
      qb = qb.or(parts.join(','))
    }
  }

  if (cursor) {
    // Keyset pagination: rows strictly older than the cursor.
    // (created_at, id) < (cursor.created_at, cursor.id)
    qb = qb.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
    )
  }

  const { data, error, count } = await qb

  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to list profiles: ${error.message}`,
      500
    )
  }

  const rows = (data ?? []) as Profile[]
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  // Enrich with order_count (best-effort — soft-fails to 0 if portal-owned
  // orders table is unreachable on the shared project).
  const ids = page.map((p) => p.id)
  const orderCounts = new Map<string, number>()
  if (ids.length > 0) {
    const { data: ordersRaw } = await db
      .from('orders')
      .select('client_id, consultant_id')
      .or(`client_id.in.(${ids.join(',')}),consultant_id.in.(${ids.join(',')})`)

    for (const row of (ordersRaw ?? []) as Array<{
      client_id: string | null
      consultant_id: string | null
    }>) {
      if (row.client_id && ids.includes(row.client_id)) {
        orderCounts.set(row.client_id, (orderCounts.get(row.client_id) ?? 0) + 1)
      }
      if (row.consultant_id && ids.includes(row.consultant_id)) {
        orderCounts.set(
          row.consultant_id,
          (orderCounts.get(row.consultant_id) ?? 0) + 1
        )
      }
    }
  }

  // last_seen_at — approximate from chat_conversations.last_message_at where
  // the visitor email matches the profile email. Fast enough for 30-50 rows.
  const lastSeen = new Map<string, string>()
  const emails = page.map((p) => p.email).filter(Boolean)
  if (emails.length > 0) {
    const { data: convRaw } = await db
      .from('chat_conversations')
      .select('visitor_email, last_message_at')
      .in('visitor_email', emails)
      .order('last_message_at', { ascending: false })

    for (const row of (convRaw ?? []) as Array<{
      visitor_email: string | null
      last_message_at: string | null
    }>) {
      if (row.visitor_email && row.last_message_at && !lastSeen.has(row.visitor_email)) {
        lastSeen.set(row.visitor_email, row.last_message_at)
      }
    }
  }

  const users: UserDirectoryRow[] = page.map((p) => ({
    ...p,
    order_count: orderCounts.get(p.id) ?? 0,
    last_seen_at: lastSeen.get(p.email) ?? null,
  }))

  const nextCursor =
    hasMore && page.length > 0
      ? encodeCursor({
          created_at: page[page.length - 1].created_at,
          id: page[page.length - 1].id,
        })
      : null

  return {
    users,
    nextCursor,
    total: count ?? users.length,
  }
}

// ============================================================
// getUserById — 360 bundle
// ============================================================

export async function getUserById(profileId: string): Promise<User360Bundle> {
  await requireSupportOrAdmin()
  const db = createSupabaseAdminClient()
  const profile = await loadTargetProfile(db, profileId)

  const [
    ordersRes,
    walletRes,
    conversationsRes,
    auditRes,
    notesRes,
  ] = await Promise.all([
    db
      .from('orders')
      .select(
        'id, order_number, status, total_amount, gateway, created_at, updated_at, client_id, consultant_id'
      )
      .or(`client_id.eq.${profileId},consultant_id.eq.${profileId}`)
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('student_wallets')
      .select('profile_id, balance_cents, currency, updated_at')
      .eq('profile_id', profileId)
      .maybeSingle(),
    db
      .from('chat_conversations')
      .select('*')
      .eq('visitor_email', profile.email)
      .order('last_message_at', { ascending: false })
      .limit(50),
    db
      .from('support_audit_log')
      .select('*')
      .eq('target_type', 'profile')
      .eq('target_id', profileId)
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('support_user_notes_v')
      .select('id, actor_id, profile_id, body, created_at')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  return {
    profile,
    orders: ((ordersRes.data ?? []) as PortalOrderRow[]),
    wallet: (walletRes.data as PortalWalletSnapshot | null) ?? null,
    conversations: ((conversationsRes.data ?? []) as ChatConversation[]),
    audit: ((auditRes.data ?? []) as SupportAuditLogEntry[]),
    notes: ((notesRes.data ?? []) as SupportUserNote[]),
  }
}

// ============================================================
// Mutations — suspend / reactivate / change role / add note
// ============================================================

export interface SuspendUserInput {
  profileId: string
  reason: string
}

export async function suspendUser(input: SuspendUserInput): Promise<Profile> {
  const actor = await requireSupportOrAdmin()
  const reason = (input.reason ?? '').trim()
  if (reason.length < SUSPEND_REASON_MIN) {
    throw new SupportActionError(
      'invalid_input',
      `Reason must be at least ${SUSPEND_REASON_MIN} characters`,
      400
    )
  }

  const db = createSupabaseAdminClient()
  const target = await loadTargetProfile(db, input.profileId)
  assertSupportCanActOnTarget(actor, target, 'user.suspend')

  if (target.status === 'suspended') return target

  const { data, error } = await db
    .from('profiles')
    .update({ status: 'suspended' })
    .eq('id', input.profileId)
    .select('*')
    .single()

  if (error || !data) {
    throw new SupportActionError(
      'db_error',
      `Failed to suspend user: ${error?.message ?? 'unknown'}`,
      500
    )
  }

  await logSupportAction({
    action: 'user.suspend',
    targetType: 'profile',
    targetId: input.profileId,
    reason,
    metadata: { prior_status: target.status, target_role: target.role },
  })

  return data as Profile
}

export interface ReactivateUserInput {
  profileId: string
  reason: string
}

export async function reactivateUser(input: ReactivateUserInput): Promise<Profile> {
  const actor = await requireSupportOrAdmin()
  const reason = (input.reason ?? '').trim()
  if (reason.length < SUSPEND_REASON_MIN) {
    throw new SupportActionError(
      'invalid_input',
      `Reason must be at least ${SUSPEND_REASON_MIN} characters`,
      400
    )
  }

  const db = createSupabaseAdminClient()
  const target = await loadTargetProfile(db, input.profileId)
  assertSupportCanActOnTarget(actor, target, 'user.reactivate')

  if (target.status === 'active') return target

  const { data, error } = await db
    .from('profiles')
    .update({ status: 'active' })
    .eq('id', input.profileId)
    .select('*')
    .single()

  if (error || !data) {
    throw new SupportActionError(
      'db_error',
      `Failed to reactivate user: ${error?.message ?? 'unknown'}`,
      500
    )
  }

  await logSupportAction({
    action: 'user.reactivate',
    targetType: 'profile',
    targetId: input.profileId,
    reason,
    metadata: { prior_status: target.status, target_role: target.role },
  })

  return data as Profile
}

export interface ChangeUserRoleInput {
  profileId: string
  newRole: Role
  reason: string
}

export async function changeUserRole(input: ChangeUserRoleInput): Promise<Profile> {
  const actor = await requireSupportOrAdmin()
  requireCan(actor, 'user.change_role')
  if (!ALL_ROLES.includes(input.newRole)) {
    throw new SupportActionError('invalid_input', 'Unknown role', 400)
  }
  const reason = (input.reason ?? '').trim()
  if (reason.length < SUSPEND_REASON_MIN) {
    throw new SupportActionError(
      'invalid_input',
      `Reason must be at least ${SUSPEND_REASON_MIN} characters`,
      400
    )
  }

  const db = createSupabaseAdminClient()
  const target = await loadTargetProfile(db, input.profileId)

  if (target.role === input.newRole) return target

  const { data, error } = await db
    .from('profiles')
    .update({ role: input.newRole })
    .eq('id', input.profileId)
    .select('*')
    .single()

  if (error || !data) {
    throw new SupportActionError(
      'db_error',
      `Failed to change role: ${error?.message ?? 'unknown'}`,
      500
    )
  }

  await logSupportAction({
    action: 'user.change_role',
    targetType: 'profile',
    targetId: input.profileId,
    reason,
    metadata: { prior_role: target.role, new_role: input.newRole },
  })

  return data as Profile
}

export interface AddUserNoteInput {
  profileId: string
  body: string
}

export async function addUserNote(input: AddUserNoteInput): Promise<SupportAuditLogEntry> {
  await requireSupportOrAdmin()
  const body = (input.body ?? '').trim()
  if (body.length < NOTE_BODY_MIN) {
    throw new SupportActionError(
      'invalid_input',
      `Note must be at least ${NOTE_BODY_MIN} characters`,
      400
    )
  }

  const db = createSupabaseAdminClient()
  // Confirm the target exists so we don't leave orphan notes.
  await loadTargetProfile(db, input.profileId)

  return logSupportAction({
    action: 'note.add',
    targetType: 'profile',
    targetId: input.profileId,
    metadata: { body },
  })
}
