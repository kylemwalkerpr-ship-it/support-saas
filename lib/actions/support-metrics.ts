'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { SupportActionError } from '@/lib/errors'
import { requireCan } from '@/lib/rbac'

// ============================================================
// Types — Phase 3 dashboard home tiles (minimal scaffolding;
// detailed metrics live in Phase 9).
// ============================================================

export interface HomeMetrics {
  openConversationsAssignedToMe: number
  openDisputesTeamWide: number
  pendingVerifications: number
  flaggedContentLast24h: number
  refundsTodayCount: number
  refundsTodayTotalCents: number
  myOpenNotifications: number
}

const ZERO: HomeMetrics = {
  openConversationsAssignedToMe: 0,
  openDisputesTeamWide: 0,
  pendingVerifications: 0,
  flaggedContentLast24h: 0,
  refundsTodayCount: 0,
  refundsTodayTotalCents: 0,
  myOpenNotifications: 0,
}

function startOfTodayIso(): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

export async function getHomeMetrics(): Promise<HomeMetrics> {
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

  const db = createSupabaseAdminClient()
  const out: HomeMetrics = { ...ZERO }

  // 1. Open conversations assigned to me
  try {
    const { count } = await db
      .from('chat_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to_id', profile.id)
      .in('status', ['waiting_for_agent', 'assigned'])
    out.openConversationsAssignedToMe = count ?? 0
  } catch (err) {
    console.warn('[getHomeMetrics] conversations count failed', err)
  }

  // 2. Open disputes (team-wide)
  try {
    const { count } = await db
      .from('disputes')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'triage'])
    out.openDisputesTeamWide = count ?? 0
  } catch (err) {
    console.warn('[getHomeMetrics] disputes count failed', err)
  }

  // 3. Pending verifications — query portal application tables read-only.
  // Schema not yet wired in saas; soft-fail to 0 (Phase 6 will wire it).
  try {
    let total = 0
    for (const table of ['attorney_applications', 'consultant_intakes']) {
      const { count } = await db
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      total += count ?? 0
    }
    out.pendingVerifications = total
  } catch (err) {
    console.warn('[getHomeMetrics] verifications count failed', err)
  }

  // 4. Flagged content (last 24h) — moderation_flags pending in window
  try {
    const since = hoursAgoIso(24)
    const { count } = await db
      .from('moderation_flags')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('created_at', since)
    out.flaggedContentLast24h = count ?? 0
  } catch (err) {
    console.warn('[getHomeMetrics] flags count failed', err)
  }

  // 5. Refunds processed today — count + sum from support_audit_log
  try {
    const since = startOfTodayIso()
    const { data } = await db
      .from('support_audit_log')
      .select('metadata')
      .eq('action', 'order.refund')
      .gte('created_at', since)

    let totalCents = 0
    for (const row of (data ?? []) as Array<{ metadata: Record<string, unknown> | null }>) {
      const raw = row.metadata?.amountCents
      if (typeof raw === 'number' && Number.isFinite(raw)) totalCents += Math.floor(raw)
    }
    out.refundsTodayCount = (data ?? []).length
    out.refundsTodayTotalCents = totalCents
  } catch (err) {
    console.warn('[getHomeMetrics] refunds count failed', err)
  }

  // 6. My open notifications
  try {
    const { count } = await db
      .from('support_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', profile.id)
      .is('read_at', null)
    out.myOpenNotifications = count ?? 0
  } catch (err) {
    console.warn('[getHomeMetrics] notifications count failed', err)
  }

  return out
}

// ============================================================
// Phase 9 — Agent + team metrics
// ============================================================

export type MetricsRange = 'today' | '7d' | '30d'

export interface DisputeBreakdown {
  resolved_refund: number
  resolved_release: number
  resolved_split: number
  rejected: number
}

export interface AgentMetrics {
  range: MetricsRange
  conversationsResolvedToday: number
  conversationsResolved7d: number
  conversationsResolved30d: number
  firstResponseMedianSeconds: number | null
  firstResponseP95Seconds: number | null
  refundsCount: number
  refundsTotalCents: number
  disputesDecidedCount: number
  disputesBreakdown: DisputeBreakdown
  verificationsDecidedCount: number
  verificationsMedianHours: number | null
  myOpenNotifications: number
  // CSAT — placeholder until schema lands.
  csatPlaceholder: 0
}

export interface TeamMetrics extends Omit<AgentMetrics, 'myOpenNotifications'> {}

function rangeStartIso(range: MetricsRange): string {
  const now = Date.now()
  switch (range) {
    case 'today': {
      const d = new Date()
      d.setUTCHours(0, 0, 0, 0)
      return d.toISOString()
    }
    case '7d':
      return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
    case '30d':
      return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  )
  return sorted[idx]
}

interface AuditMetricsRow {
  action: string
  metadata: Record<string, unknown> | null
  created_at: string
}

async function loadAuditMetricsRows(
  db: ReturnType<typeof createSupabaseAdminClient>,
  options: {
    actorId?: string | null
    since: string
    actions: string[]
  }
): Promise<AuditMetricsRow[]> {
  let qb = db
    .from('support_audit_log')
    .select('action, metadata, created_at')
    .in('action', options.actions)
    .gte('created_at', options.since)
    .order('created_at', { ascending: false })
    .limit(10000)
  if (options.actorId) qb = qb.eq('actor_id', options.actorId)
  const { data, error } = await qb
  if (error) {
    console.warn('[metrics] audit lookup failed', error)
    return []
  }
  return (data ?? []) as AuditMetricsRow[]
}

interface ConversationCounts {
  today: number
  d7: number
  d30: number
}

async function countConversationsResolved(
  db: ReturnType<typeof createSupabaseAdminClient>,
  options: { assignedToId?: string | null }
): Promise<ConversationCounts> {
  const out: ConversationCounts = { today: 0, d7: 0, d30: 0 }
  const ranges: Array<{ key: keyof ConversationCounts; since: string }> = [
    { key: 'today', since: rangeStartIso('today') },
    { key: 'd7', since: rangeStartIso('7d') },
    { key: 'd30', since: rangeStartIso('30d') },
  ]
  for (const r of ranges) {
    let qb = db
      .from('chat_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('inbox_status', 'resolved')
      .gte('resolved_at', r.since)
    if (options.assignedToId) qb = qb.eq('assigned_to_id', options.assignedToId)
    const { count } = await qb
    out[r.key] = count ?? 0
  }
  return out
}

async function loadFirstResponseSeconds(
  db: ReturnType<typeof createSupabaseAdminClient>,
  options: { assignedToId?: string | null; since: string }
): Promise<number[]> {
  // Pull resolved conversations in the window, then for each one fetch the
  // earliest support message and compare to last_customer_message_at. Cap to
  // 500 conversations to keep this bounded on a metrics page render.
  let qb = db
    .from('chat_conversations')
    .select('id, last_customer_message_at')
    .eq('inbox_status', 'resolved')
    .gte('resolved_at', options.since)
    .not('last_customer_message_at', 'is', null)
    .order('resolved_at', { ascending: false })
    .limit(500)
  if (options.assignedToId) qb = qb.eq('assigned_to_id', options.assignedToId)
  const { data, error } = await qb
  if (error) {
    console.warn('[metrics] first-response conv lookup failed', error)
    return []
  }
  const conversations = (data ?? []) as Array<{
    id: string
    last_customer_message_at: string | null
  }>
  if (conversations.length === 0) return []
  const ids = conversations.map((c) => c.id)
  // Fetch earliest support/agent message per conversation. PostgREST has no
  // first-per-group, so we batch-fetch all messages with sender_type='agent'
  // for these conversations within the window and reduce app-side.
  const { data: msgs, error: msgErr } = await db
    .from('chat_messages')
    .select('conversation_id, created_at, sender_type')
    .in('conversation_id', ids)
    .eq('sender_type', 'agent')
    .order('created_at', { ascending: true })
  if (msgErr) {
    console.warn('[metrics] first-response msg lookup failed', msgErr)
    return []
  }
  const firstSupportByConv = new Map<string, string>()
  for (const m of (msgs ?? []) as Array<{ conversation_id: string; created_at: string }>) {
    if (!firstSupportByConv.has(m.conversation_id)) {
      firstSupportByConv.set(m.conversation_id, m.created_at)
    }
  }
  const seconds: number[] = []
  for (const conv of conversations) {
    const first = firstSupportByConv.get(conv.id)
    if (!first || !conv.last_customer_message_at) continue
    const delta =
      (new Date(first).getTime() - new Date(conv.last_customer_message_at).getTime()) /
      1000
    if (Number.isFinite(delta) && delta >= 0) seconds.push(delta)
  }
  return seconds
}

interface RefundsAggregate {
  count: number
  totalCents: number
}

function summariseRefunds(rows: AuditMetricsRow[]): RefundsAggregate {
  let count = 0
  let totalCents = 0
  for (const r of rows) {
    if (r.action !== 'order.refund') continue
    count += 1
    const raw = r.metadata?.amountCents
    if (typeof raw === 'number' && Number.isFinite(raw)) totalCents += Math.floor(raw)
  }
  return { count, totalCents }
}

function summariseDisputes(rows: AuditMetricsRow[]): {
  count: number
  breakdown: DisputeBreakdown
} {
  const breakdown: DisputeBreakdown = {
    resolved_refund: 0,
    resolved_release: 0,
    resolved_split: 0,
    rejected: 0,
  }
  let count = 0
  for (const r of rows) {
    if (r.action !== 'dispute.decide') continue
    count += 1
    const decision = r.metadata?.decision
    if (decision === 'refund_full' || decision === 'refund_partial') {
      breakdown.resolved_refund += 1
    } else if (decision === 'release') {
      breakdown.resolved_release += 1
    } else if (decision === 'split') {
      breakdown.resolved_split += 1
    } else if (decision === 'reject') {
      breakdown.rejected += 1
    }
  }
  return { count, breakdown }
}

async function loadVerificationDecisionHours(
  db: ReturnType<typeof createSupabaseAdminClient>,
  options: { actorId?: string | null; since: string }
): Promise<number[]> {
  let qb = db
    .from('attorney_applications')
    .select('created_at, decided_at, decided_by')
    .not('decided_at', 'is', null)
    .gte('decided_at', options.since)
    .limit(2000)
  if (options.actorId) qb = qb.eq('decided_by', options.actorId)
  const { data, error } = await qb
  if (error) {
    console.warn('[metrics] verification lookup failed', error)
    return []
  }
  const hours: number[] = []
  for (const row of (data ?? []) as Array<{
    created_at: string | null
    decided_at: string | null
  }>) {
    if (!row.created_at || !row.decided_at) continue
    const delta =
      (new Date(row.decided_at).getTime() - new Date(row.created_at).getTime()) /
      (1000 * 60 * 60)
    if (Number.isFinite(delta) && delta >= 0) hours.push(delta)
  }
  return hours
}

async function buildMetrics(
  db: ReturnType<typeof createSupabaseAdminClient>,
  options: { actorId?: string | null; range: MetricsRange }
): Promise<Omit<AgentMetrics, 'myOpenNotifications'>> {
  const since = rangeStartIso(options.range)
  const auditRows = await loadAuditMetricsRows(db, {
    actorId: options.actorId ?? null,
    since,
    actions: ['order.refund', 'dispute.decide'],
  })

  const conv = await countConversationsResolved(db, {
    assignedToId: options.actorId ?? null,
  })
  const frSeconds = await loadFirstResponseSeconds(db, {
    assignedToId: options.actorId ?? null,
    since,
  })
  const refunds = summariseRefunds(auditRows)
  const disputes = summariseDisputes(auditRows)
  const verificationHours = await loadVerificationDecisionHours(db, {
    actorId: options.actorId ?? null,
    since,
  })

  return {
    range: options.range,
    conversationsResolvedToday: conv.today,
    conversationsResolved7d: conv.d7,
    conversationsResolved30d: conv.d30,
    firstResponseMedianSeconds: median(frSeconds),
    firstResponseP95Seconds: percentile(frSeconds, 95),
    refundsCount: refunds.count,
    refundsTotalCents: refunds.totalCents,
    disputesDecidedCount: disputes.count,
    disputesBreakdown: disputes.breakdown,
    verificationsDecidedCount: verificationHours.length,
    verificationsMedianHours: median(verificationHours),
    csatPlaceholder: 0,
  }
}

export async function getAgentMetrics(input: {
  profileId?: string
  range?: MetricsRange
}): Promise<AgentMetrics> {
  const profile = await getOrCreateProfile()
  requireCan(profile, 'metrics.read_mine')

  // A support agent can only view their own metrics. An admin may pass any
  // profileId — checked through rbac.can('metrics.read_team').
  let actorId = profile.id
  if (input.profileId && input.profileId !== profile.id) {
    requireCan(profile, 'metrics.read_team')
    actorId = input.profileId
  }

  const range: MetricsRange = input.range ?? '7d'
  const db = createSupabaseAdminClient()
  const base = await buildMetrics(db, { actorId, range })

  let myOpenNotifications = 0
  try {
    const { count } = await db
      .from('support_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', actorId)
      .is('read_at', null)
    myOpenNotifications = count ?? 0
  } catch (err) {
    console.warn('[getAgentMetrics] notifications count failed', err)
  }

  return { ...base, myOpenNotifications }
}

export async function getTeamMetrics(input: {
  range?: MetricsRange
}): Promise<TeamMetrics> {
  const profile = await getOrCreateProfile()
  requireCan(profile, 'metrics.read_team')
  const range: MetricsRange = input.range ?? '7d'
  const db = createSupabaseAdminClient()
  return buildMetrics(db, { actorId: null, range })
}
