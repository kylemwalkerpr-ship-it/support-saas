'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { SupportActionError } from '@/lib/actions/support-audit'

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
