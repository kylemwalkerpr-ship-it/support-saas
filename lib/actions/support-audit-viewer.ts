'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { SupportActionError } from '@/lib/errors'
import { requireCan } from '@/lib/rbac'
import type { Profile, SupportAuditLogEntry, SupportActorRole } from '@/lib/types'

// ============================================================
// Phase 9 — Audit log viewer (READ side)
//
// Phase 1 owns the WRITE side (support-audit.ts). This module is the
// read/search/export companion. Keep them separate so the write surface
// stays small and obviously auditable.
// ============================================================

export interface AuditSearchInput {
  actor?: string | null
  action?: string | null
  target_type?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  q?: string | null
  cursor?: string | null
  limit?: number | null
}

export interface AuditSearchRow extends SupportAuditLogEntry {
  actor_email: string | null
  actor_name: string | null
}

export interface AuditSearchResult {
  rows: AuditSearchRow[]
  nextCursor: string | null
  total: number
}

const SEARCH_DEFAULT_LIMIT = 30
const SEARCH_MAX_LIMIT = 100
const EXPORT_MAX_ROWS = 10000

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
      if (typeof obj.created_at === 'string' && typeof obj.id === 'string') {
        return { created_at: obj.created_at, id: obj.id }
      }
    }
    return null
  } catch {
    return null
  }
}

function clampLimit(limit: number | null | undefined): number {
  if (!limit || Number.isNaN(limit)) return SEARCH_DEFAULT_LIMIT
  return Math.min(SEARCH_MAX_LIMIT, Math.max(1, Math.floor(limit)))
}

function defaultDateFromIso(): string {
  // Default view per brief: last 7 days.
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
}

function isSupportActorRole(role: string): role is SupportActorRole {
  return role === 'support' || role === 'admin'
}

async function requireSupportOrAdmin(): Promise<Profile> {
  const profile = await getOrCreateProfile()
  if (!profile) {
    throw new SupportActionError('unauthorized', 'No authenticated profile', 401)
  }
  if (!isSupportActorRole(profile.role)) {
    throw new SupportActionError(
      'forbidden',
      `Role '${profile.role}' is not permitted on this surface`,
      403
    )
  }
  return profile
}

async function requireAdmin(): Promise<Profile> {
  const profile = await requireSupportOrAdmin()
  requireCan(profile, 'audit.export')
  return profile
}

interface NormalisedFilters {
  actor: string | null
  action: string | null
  target_type: string | null
  dateFrom: string
  dateTo: string | null
  q: string | null
}

function normaliseFilters(input: AuditSearchInput): NormalisedFilters {
  const dateFrom = input.dateFrom?.trim() || defaultDateFromIso()
  return {
    actor: input.actor?.trim() || null,
    action: input.action?.trim() || null,
    target_type: input.target_type?.trim() || null,
    dateFrom,
    dateTo: input.dateTo?.trim() || null,
    q: input.q?.trim() || null,
  }
}

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

async function hydrateActors(
  db: SupabaseAdminClient,
  actorIds: string[]
): Promise<Map<string, { email: string | null; name: string | null }>> {
  const map = new Map<string, { email: string | null; name: string | null }>()
  if (actorIds.length === 0) return map
  const { data } = await db
    .from('profiles')
    .select('id, email, full_name')
    .in('id', actorIds)
  for (const row of (data ?? []) as Array<{
    id: string
    email: string | null
    full_name: string | null
  }>) {
    map.set(row.id, { email: row.email, name: row.full_name })
  }
  return map
}

// ============================================================
// searchAuditLog — paginated viewer
// ============================================================

export async function searchAuditLog(
  input: AuditSearchInput
): Promise<AuditSearchResult> {
  await requireSupportOrAdmin()
  const filters = normaliseFilters(input)
  const limit = clampLimit(input.limit)
  const cursor = decodeCursor(input.cursor)

  const db = createSupabaseAdminClient()

  // Mirror the metadata jsonb to text on-the-fly via a generated alias is not
  // available through PostgREST; instead, we use the underlying ::text cast in
  // a follow-up filter expression. Supabase exposes this via the `or()` filter
  // referencing a virtual column we create at SQL level — but to keep this
  // migration-free we read with metadata cast happening client-side: prefetch
  // the candidate window with reason ilike, then post-filter metadata text.
  //
  // For correctness when `q` is set we do TWO queries: one with reason ilike,
  // and one fetching the rows in the date window without `q`, then dedupe and
  // filter by JSON.stringify(metadata).includes(q) in app land. At cap-100
  // page size this stays fast enough; Phase 10 will introduce a tsvector.

  // Base ordering: created_at DESC, id DESC (newest first).
  let qb = db
    .from('support_audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .gte('created_at', filters.dateFrom)
    .limit(limit + 1)

  if (filters.dateTo) qb = qb.lte('created_at', filters.dateTo)
  if (filters.actor) qb = qb.eq('actor_id', filters.actor)
  if (filters.action) qb = qb.eq('action', filters.action)
  if (filters.target_type) qb = qb.eq('target_type', filters.target_type)
  if (filters.q) qb = qb.ilike('reason', `%${filters.q}%`)

  if (cursor) {
    // (created_at, id) lexicographic strictly less than cursor for DESC scan.
    qb = qb.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
    )
  }

  const { data, error, count } = await qb
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to search audit log: ${error.message}`,
      500
    )
  }

  let entries = (data ?? []) as SupportAuditLogEntry[]

  // App-side fallback metadata search: when `q` is set, also pull a second
  // window with no reason-filter and union, so metadata-only hits are not
  // dropped. We cap this auxiliary fetch at limit*4 to stay bounded.
  if (filters.q) {
    let qb2 = db
      .from('support_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .gte('created_at', filters.dateFrom)
      .limit(limit * 4)
    if (filters.dateTo) qb2 = qb2.lte('created_at', filters.dateTo)
    if (filters.actor) qb2 = qb2.eq('actor_id', filters.actor)
    if (filters.action) qb2 = qb2.eq('action', filters.action)
    if (filters.target_type) qb2 = qb2.eq('target_type', filters.target_type)
    if (cursor) {
      qb2 = qb2.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
      )
    }
    const { data: jsonHits } = await qb2
    const needle = filters.q.toLowerCase()
    const extra = ((jsonHits ?? []) as SupportAuditLogEntry[]).filter((row) => {
      try {
        return JSON.stringify(row.metadata ?? {}).toLowerCase().includes(needle)
      } catch {
        return false
      }
    })
    const seen = new Set(entries.map((e) => e.id))
    for (const e of extra) {
      if (!seen.has(e.id)) {
        entries.push(e)
        seen.add(e.id)
      }
    }
    entries.sort((a, b) => {
      if (a.created_at === b.created_at) return a.id < b.id ? 1 : -1
      return a.created_at < b.created_at ? 1 : -1
    })
  }

  const hasMore = entries.length > limit
  const page = hasMore ? entries.slice(0, limit) : entries

  const actorIds = Array.from(new Set(page.map((e) => e.actor_id)))
  const actors = await hydrateActors(db, actorIds)

  const rows: AuditSearchRow[] = page.map((e) => {
    const a = actors.get(e.actor_id)
    return {
      ...e,
      actor_email: a?.email ?? null,
      actor_name: a?.name ?? null,
    }
  })

  const nextCursor =
    hasMore && page.length > 0
      ? encodeCursor({
          created_at: page[page.length - 1].created_at,
          id: page[page.length - 1].id,
        })
      : null

  return { rows, nextCursor, total: count ?? rows.length }
}

// ============================================================
// exportAuditLog — admin-only CSV export
// ============================================================

export interface AuditExportResult {
  rows: AuditSearchRow[]
  truncated: boolean
}

export async function exportAuditLog(
  input: AuditSearchInput
): Promise<AuditExportResult> {
  await requireAdmin()
  const filters = normaliseFilters(input)
  const db = createSupabaseAdminClient()

  // Pull up to EXPORT_MAX_ROWS + 1 to detect truncation. We don't paginate at
  // export time — admins are expected to narrow filters when the cap is hit.
  let qb = db
    .from('support_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .gte('created_at', filters.dateFrom)
    .limit(EXPORT_MAX_ROWS + 1)

  if (filters.dateTo) qb = qb.lte('created_at', filters.dateTo)
  if (filters.actor) qb = qb.eq('actor_id', filters.actor)
  if (filters.action) qb = qb.eq('action', filters.action)
  if (filters.target_type) qb = qb.eq('target_type', filters.target_type)
  if (filters.q) qb = qb.ilike('reason', `%${filters.q}%`)

  const { data, error } = await qb
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to export audit log: ${error.message}`,
      500
    )
  }

  let entries = (data ?? []) as SupportAuditLogEntry[]

  // Apply free-text metadata filter app-side (same approach as search).
  if (filters.q) {
    const needle = filters.q.toLowerCase()
    entries = entries.filter((row) => {
      if (row.reason && row.reason.toLowerCase().includes(needle)) return true
      try {
        return JSON.stringify(row.metadata ?? {}).toLowerCase().includes(needle)
      } catch {
        return false
      }
    })
  }

  const truncated = entries.length > EXPORT_MAX_ROWS
  if (truncated) {
    throw new SupportActionError(
      'export_too_large',
      `Export would exceed ${EXPORT_MAX_ROWS} rows — narrow your filters (date range, actor, action, or target type) and try again.`,
      413
    )
  }

  const actorIds = Array.from(new Set(entries.map((e) => e.actor_id)))
  const actors = await hydrateActors(db, actorIds)

  const rows: AuditSearchRow[] = entries.map((e) => {
    const a = actors.get(e.actor_id)
    return {
      ...e,
      actor_email: a?.email ?? null,
      actor_name: a?.name ?? null,
    }
  })

  return { rows, truncated: false }
}

// ============================================================
// CSV serialisation — basic RFC 4180 quoting
// ============================================================

function csvEscape(value: string | null | undefined): string {
  const raw = value == null ? '' : String(value)
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

// Async so it satisfies the 'use server' contract (only async
// exports allowed). Pure function otherwise — no IO.
export async function toCsv(rows: AuditSearchRow[]): Promise<string> {
  const header = [
    'id',
    'created_at',
    'actor_email',
    'actor_role',
    'action',
    'target_type',
    'target_id',
    'reason',
  ]
  const lines: string[] = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.id),
        csvEscape(r.created_at),
        csvEscape(r.actor_email),
        csvEscape(r.actor_role),
        csvEscape(r.action),
        csvEscape(r.target_type),
        csvEscape(r.target_id),
        csvEscape(r.reason),
      ].join(',')
    )
  }
  return lines.join('\r\n') + '\r\n'
}
