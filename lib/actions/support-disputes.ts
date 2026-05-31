'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import {
  logSupportAction,
  SupportActionError,
} from '@/lib/actions/support-audit'
import {
  processRefund,
  type PortalOrderRow,
} from '@/lib/actions/support-orders'
import { processEscrowRelease } from '@/lib/actions/support-escrow'
import { SUPPORT_REFUND_CAP_CENTS } from '@/lib/constants'
import type {
  Profile,
  Dispute,
  DisputeStatus,
  DisputeProposedDecision,
} from '@/lib/types'

// ============================================================
// Phase 4 — Dispute queue, triage, decision flow, co-sign
// ============================================================

export type DisputeAgeBucket = 'lt24' | 'lt72' | 'gt72'

export interface SearchDisputesInput {
  status?: DisputeStatus[]
  ageBucket?: DisputeAgeBucket
  cursor?: string | null
  limit?: number
}

export interface DisputeQueueRow extends Dispute {
  order_total_amount: number | null
  order_status: string | null
  order_number: string | null
  buyer_label: string | null
  seller_label: string | null
}

export interface SearchDisputesResult {
  rows: DisputeQueueRow[]
  nextCursor: string | null
  total: number
}

export interface DisputeTriageBundle {
  dispute: Dispute
  order: PortalOrderRow
  buyer: Profile | null
  seller: Profile | null
  buyerHistory: PortalOrderRow[]
  sellerHistory: PortalOrderRow[]
}

export type DisputeDecision =
  | 'refund_full'
  | 'refund_partial'
  | 'release'
  | 'split'
  | 'reject'

export interface DecideDisputeInput {
  disputeId: string
  decision: DisputeDecision
  amountCents?: number
  releaseCents?: number
  notes: string
}

export interface DecideDisputeResult {
  dispute: Dispute
  status: 'executed' | 'awaiting_co_sign'
}

export interface CosignDisputeInput {
  disputeId: string
  action: 'approve' | 'reject'
  notes?: string
}

const SEARCH_DEFAULT_LIMIT = 30
const SEARCH_MAX_LIMIT = 100
const NOTES_MIN = 20

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

function ageBucketCutoff(bucket: DisputeAgeBucket): {
  gte?: string
  lt?: string
} {
  const now = Date.now()
  const h = 60 * 60 * 1000
  switch (bucket) {
    case 'lt24':
      return { gte: new Date(now - 24 * h).toISOString() }
    case 'lt72':
      return {
        gte: new Date(now - 72 * h).toISOString(),
        lt: new Date(now - 24 * h).toISOString(),
      }
    case 'gt72':
      return { lt: new Date(now - 72 * h).toISOString() }
  }
}

async function loadOrderRow(
  db: ReturnType<typeof createSupabaseAdminClient>,
  orderId: string
): Promise<PortalOrderRow> {
  const { data, error } = await db
    .from('orders')
    .select(
      'id, order_number, status, total_amount, gateway, created_at, updated_at, delivery_deadline, cancelled_at, refunded_at, refunded_amount, client_id, consultant_id, service_id'
    )
    .eq('id', orderId)
    .maybeSingle()
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to load order: ${error.message}`,
      500
    )
  }
  if (!data) {
    throw new SupportActionError('not_found', 'Order not found', 404)
  }
  let serviceTitle: string | null = null
  if (data.service_id) {
    const { data: svc } = await db
      .from('services')
      .select('title')
      .eq('id', data.service_id)
      .maybeSingle()
    serviceTitle = (svc as { title?: string } | null)?.title ?? null
  }
  return {
    ...(data as Omit<PortalOrderRow, 'service_title'>),
    service_title: serviceTitle,
  }
}

async function loadProfileById(
  db: ReturnType<typeof createSupabaseAdminClient>,
  id: string | null
): Promise<Profile | null> {
  if (!id) return null
  const { data } = await db.from('profiles').select('*').eq('id', id).maybeSingle()
  return (data as Profile | null) ?? null
}

async function loadDispute(
  db: ReturnType<typeof createSupabaseAdminClient>,
  disputeId: string
): Promise<Dispute> {
  const { data, error } = await db
    .from('disputes')
    .select('*')
    .eq('id', disputeId)
    .maybeSingle()
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to load dispute: ${error.message}`,
      500
    )
  }
  if (!data) {
    throw new SupportActionError('not_found', 'Dispute not found', 404)
  }
  return data as Dispute
}

function dollarsToCents(value: number | null): number {
  if (value == null || Number.isNaN(value)) return 0
  return Math.round(value * 100)
}

// ============================================================
// searchDisputes — queue listing
// ============================================================

export async function searchDisputes(
  input: SearchDisputesInput
): Promise<SearchDisputesResult> {
  await requireSupportOrAdmin()
  const limit = clampLimit(input.limit)
  const cursor = decodeCursor(input.cursor)
  const statuses =
    input.status && input.status.length > 0
      ? input.status
      : (['open', 'triage'] as DisputeStatus[])

  const db = createSupabaseAdminClient()

  // SLA-risk ordering: oldest open first means ASC by created_at.
  let qb = db
    .from('disputes')
    .select('*', { count: 'exact' })
    .in('status', statuses)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit + 1)

  if (input.ageBucket) {
    const { gte, lt } = ageBucketCutoff(input.ageBucket)
    // gte=older than X means created_at <= X-from-now. The helper expresses
    // boundaries in absolute timestamps already.
    if (gte) qb = qb.lte('created_at', gte) // dispute is at least X old
    if (lt) qb = qb.gt('created_at', lt) // but no older than the next bucket
  }

  if (cursor) {
    qb = qb.or(
      `created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`
    )
  }

  const { data, error, count } = await qb
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to list disputes: ${error.message}`,
      500
    )
  }

  const disputes = (data ?? []) as Dispute[]
  const hasMore = disputes.length > limit
  const page = hasMore ? disputes.slice(0, limit) : disputes

  // Hydrate order + party labels in batch.
  const orderIds = Array.from(new Set(page.map((d) => d.order_id).filter(Boolean)))
  const partyIds = Array.from(
    new Set(
      page.flatMap((d) => [d.opened_by, d.against_id].filter((x): x is string => !!x))
    )
  )

  const orderRowsMap = new Map<
    string,
    {
      total_amount: number | null
      status: string | null
      order_number: string | null
      client_id: string | null
      consultant_id: string | null
    }
  >()
  if (orderIds.length > 0) {
    const { data: ords } = await db
      .from('orders')
      .select('id, order_number, status, total_amount, client_id, consultant_id')
      .in('id', orderIds)
    for (const row of (ords ?? []) as Array<{
      id: string
      order_number: string | null
      status: string | null
      total_amount: number | null
      client_id: string | null
      consultant_id: string | null
    }>) {
      orderRowsMap.set(row.id, row)
    }
  }

  // Also fetch buyer/seller labels for every order (client_id/consultant_id).
  const extendedPartyIds = new Set(partyIds)
  for (const o of orderRowsMap.values()) {
    if (o.client_id) extendedPartyIds.add(o.client_id)
    if (o.consultant_id) extendedPartyIds.add(o.consultant_id)
  }

  const partyLabels = new Map<string, string>()
  if (extendedPartyIds.size > 0) {
    const { data: profs } = await db
      .from('profiles')
      .select('id, full_name, email')
      .in('id', Array.from(extendedPartyIds))
    for (const row of (profs ?? []) as Array<{
      id: string
      full_name: string | null
      email: string
    }>) {
      partyLabels.set(row.id, row.full_name ?? row.email)
    }
  }

  const rows: DisputeQueueRow[] = page.map((d) => {
    const ord = orderRowsMap.get(d.order_id) ?? null
    return {
      ...d,
      order_total_amount: ord?.total_amount ?? null,
      order_status: ord?.status ?? null,
      order_number: ord?.order_number ?? null,
      buyer_label: ord?.client_id ? partyLabels.get(ord.client_id) ?? null : null,
      seller_label: ord?.consultant_id
        ? partyLabels.get(ord.consultant_id) ?? null
        : null,
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
// getDisputeTriageBundle — full triage screen payload
// ============================================================

export async function getDisputeTriageBundle(
  disputeId: string
): Promise<DisputeTriageBundle> {
  await requireSupportOrAdmin()
  const db = createSupabaseAdminClient()
  const dispute = await loadDispute(db, disputeId)
  const order = await loadOrderRow(db, dispute.order_id)
  const [buyer, seller] = await Promise.all([
    loadProfileById(db, order.client_id),
    loadProfileById(db, order.consultant_id),
  ])

  // Buyer history with THIS seller (last 5 orders, excluding current).
  let buyerHistory: PortalOrderRow[] = []
  if (order.client_id && order.consultant_id) {
    const { data } = await db
      .from('orders')
      .select(
        'id, order_number, status, total_amount, gateway, created_at, updated_at, delivery_deadline, cancelled_at, refunded_at, refunded_amount, client_id, consultant_id, service_id'
      )
      .eq('client_id', order.client_id)
      .eq('consultant_id', order.consultant_id)
      .neq('id', order.id)
      .order('created_at', { ascending: false })
      .limit(5)
    buyerHistory = ((data ?? []) as Array<Omit<PortalOrderRow, 'service_title'>>).map(
      (r) => ({ ...r, service_title: null })
    )
  }

  // Seller history with OTHER buyers (last 5).
  let sellerHistory: PortalOrderRow[] = []
  if (order.consultant_id) {
    let q = db
      .from('orders')
      .select(
        'id, order_number, status, total_amount, gateway, created_at, updated_at, delivery_deadline, cancelled_at, refunded_at, refunded_amount, client_id, consultant_id, service_id'
      )
      .eq('consultant_id', order.consultant_id)
      .neq('id', order.id)
    if (order.client_id) q = q.neq('client_id', order.client_id)
    const { data } = await q.order('created_at', { ascending: false }).limit(5)
    sellerHistory = ((data ?? []) as Array<Omit<PortalOrderRow, 'service_title'>>).map(
      (r) => ({ ...r, service_title: null })
    )
  }

  return { dispute, order, buyer, seller, buyerHistory, sellerHistory }
}

// ============================================================
// Co-sign helpers
// ============================================================

async function fanOutAdminNotification(
  db: ReturnType<typeof createSupabaseAdminClient>,
  params: {
    type: string
    subjectType: string
    subjectId: string
    title: string
    body: string
  }
): Promise<void> {
  // Resolve "all admins" at decision time. Per Phase 4 brief we fan out one
  // row per admin in profiles — not a single row addressed to a generic id.
  // This keeps the recipient_id NOT NULL contract on support_notifications
  // honoured and lets each admin's own mark-read state tick independently.
  const { data: admins } = await db
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
  for (const adm of ((admins ?? []) as Array<{ id: string }>)) {
    await db.rpc('support_notify', {
      recipient_id: adm.id,
      type: params.type,
      subject_type: params.subjectType,
      subject_id: params.subjectId,
      title: params.title,
      body: params.body,
    })
  }
}

async function notifyOne(
  db: ReturnType<typeof createSupabaseAdminClient>,
  recipientId: string,
  params: {
    type: string
    subjectType: string
    subjectId: string
    title: string
    body: string
  }
): Promise<void> {
  await db.rpc('support_notify', {
    recipient_id: recipientId,
    type: params.type,
    subject_type: params.subjectType,
    subject_id: params.subjectId,
    title: params.title,
    body: params.body,
  })
}

// ============================================================
// decideDispute — orchestration with co-sign + execution
// ============================================================

function totalRefundCentsFor(
  decision: DisputeDecision,
  input: DecideDisputeInput
): number {
  switch (decision) {
    case 'refund_full':
      return input.amountCents ?? 0
    case 'refund_partial':
      return input.amountCents ?? 0
    case 'split':
      return input.amountCents ?? 0
    default:
      return 0
  }
}

async function executeDispute(
  db: ReturnType<typeof createSupabaseAdminClient>,
  actor: Profile,
  dispute: Dispute,
  order: PortalOrderRow,
  decision: DisputeDecision,
  amountCents: number | undefined,
  releaseCents: number | undefined,
  notes: string,
  viaCoSign: boolean
): Promise<Dispute> {
  let newStatus: DisputeStatus = 'rejected'

  if (decision === 'refund_full') {
    const cents = amountCents ?? dollarsToCents(order.total_amount)
    await processRefund({
      orderId: order.id,
      amountCents: cents,
      reason: notes,
      gateway: order.gateway ?? undefined,
    })
    newStatus = 'resolved_refund'
  } else if (decision === 'refund_partial') {
    if (!amountCents || amountCents <= 0) {
      throw new SupportActionError(
        'invalid_input',
        'amountCents required for refund_partial',
        400
      )
    }
    await processRefund({
      orderId: order.id,
      amountCents,
      reason: notes,
      gateway: order.gateway ?? undefined,
    })
    newStatus = 'resolved_refund'
  } else if (decision === 'release') {
    const cents = amountCents ?? dollarsToCents(order.total_amount)
    await processEscrowRelease({
      orderId: order.id,
      amountCents: cents,
      reason: notes,
    })
    newStatus = 'resolved_release'
  } else if (decision === 'split') {
    if (!amountCents || amountCents <= 0) {
      throw new SupportActionError(
        'invalid_input',
        'amountCents (refund portion) required for split',
        400
      )
    }
    if (!releaseCents || releaseCents <= 0) {
      throw new SupportActionError(
        'invalid_input',
        'releaseCents (release portion) required for split',
        400
      )
    }
    await processRefund({
      orderId: order.id,
      amountCents,
      reason: notes,
      gateway: order.gateway ?? undefined,
    })
    await processEscrowRelease({
      orderId: order.id,
      amountCents: releaseCents,
      reason: notes,
    })
    newStatus = 'resolved_split'
  } else if (decision === 'reject') {
    newStatus = 'rejected'
  }

  const { data: updated, error } = await db
    .from('disputes')
    .update({
      status: newStatus,
      resolution_notes: notes,
      resolved_by: actor.id,
      resolved_at: new Date().toISOString(),
      // Wipe the proposal blob once executed.
      metadata: {},
    })
    .eq('id', dispute.id)
    .select('*')
    .single()

  if (error || !updated) {
    throw new SupportActionError(
      'db_error',
      `Failed to update dispute status: ${error?.message ?? 'unknown'}`,
      500
    )
  }

  await logSupportAction({
    action: 'dispute.decide',
    targetType: 'dispute',
    targetId: dispute.id,
    reason: notes,
    metadata: {
      decision,
      amountCents: amountCents ?? null,
      releaseCents: releaseCents ?? null,
      order_id: order.id,
      via_co_sign: viaCoSign,
    },
  })

  // Notify both parties of the resolution outcome.
  if (order.client_id) {
    await notifyOne(db, order.client_id, {
      type: 'system',
      subjectType: 'dispute',
      subjectId: dispute.id,
      title: 'Dispute resolved',
      body: `Your dispute on order ${order.order_number ?? order.id.slice(0, 8)} has been resolved.`,
    })
  }
  if (order.consultant_id && order.consultant_id !== order.client_id) {
    await notifyOne(db, order.consultant_id, {
      type: 'system',
      subjectType: 'dispute',
      subjectId: dispute.id,
      title: 'Dispute resolved',
      body: `A dispute on order ${order.order_number ?? order.id.slice(0, 8)} has been resolved.`,
    })
  }

  return updated as Dispute
}

export async function decideDispute(
  input: DecideDisputeInput
): Promise<DecideDisputeResult> {
  const actor = await requireSupportOrAdmin()
  const notes = (input.notes ?? '').trim()
  if (notes.length < NOTES_MIN) {
    throw new SupportActionError(
      'invalid_input',
      `notes must be at least ${NOTES_MIN} characters`,
      400
    )
  }
  if (
    !['refund_full', 'refund_partial', 'release', 'split', 'reject'].includes(
      input.decision
    )
  ) {
    throw new SupportActionError('invalid_input', 'Invalid decision', 400)
  }

  const db = createSupabaseAdminClient()
  const dispute = await loadDispute(db, input.disputeId)

  if (
    dispute.status !== 'open' &&
    dispute.status !== 'triage'
  ) {
    throw new SupportActionError(
      'invalid_state',
      `Dispute is ${dispute.status}; cannot decide`,
      409
    )
  }

  const order = await loadOrderRow(db, dispute.order_id)

  // Co-sign threshold: total refund cents (refund portion only for split).
  const refundCents = totalRefundCentsFor(input.decision, input)
  const needsCoSign =
    actor.role === 'support' &&
    (input.decision === 'refund_full' ||
      input.decision === 'refund_partial' ||
      input.decision === 'split') &&
    refundCents > SUPPORT_REFUND_CAP_CENTS

  if (needsCoSign) {
    const proposal: DisputeProposedDecision = {
      proposed_decision: input.decision as DisputeProposedDecision['proposed_decision'],
      proposed_amount_cents: input.amountCents,
      proposed_release_cents: input.releaseCents,
      proposed_actor_id: actor.id,
      proposed_notes: notes,
      proposed_at: new Date().toISOString(),
    }
    const { data: updated, error } = await db
      .from('disputes')
      .update({
        status: 'triage',
        metadata: proposal,
      })
      .eq('id', dispute.id)
      .select('*')
      .single()
    if (error || !updated) {
      throw new SupportActionError(
        'db_error',
        `Failed to record co-sign proposal: ${error?.message ?? 'unknown'}`,
        500
      )
    }

    await logSupportAction({
      action: 'dispute.co_sign_requested',
      targetType: 'dispute',
      targetId: dispute.id,
      reason: notes,
      metadata: {
        decision: input.decision,
        amountCents: input.amountCents ?? null,
        releaseCents: input.releaseCents ?? null,
        threshold_cents: SUPPORT_REFUND_CAP_CENTS,
      },
    })

    await fanOutAdminNotification(db, {
      type: 'new_dispute',
      subjectType: 'dispute',
      subjectId: dispute.id,
      title: 'Dispute decision awaiting admin co-sign',
      body: `A ${input.decision} decision of ${refundCents} cents on order ${order.order_number ?? order.id.slice(0, 8)} needs your approval.`,
    })

    return { dispute: updated as Dispute, status: 'awaiting_co_sign' }
  }

  const updated = await executeDispute(
    db,
    actor,
    dispute,
    order,
    input.decision,
    input.amountCents,
    input.releaseCents,
    notes,
    false
  )

  return { dispute: updated, status: 'executed' }
}

// ============================================================
// cosignDispute — admin approve/reject of a proposed decision
// ============================================================

function isProposedDecision(
  metadata: Record<string, unknown>
): metadata is DisputeProposedDecision & Record<string, unknown> {
  return typeof metadata.proposed_decision === 'string'
}

export async function cosignDispute(
  input: CosignDisputeInput
): Promise<DecideDisputeResult> {
  const actor = await requireSupportOrAdmin()
  if (actor.role !== 'admin') {
    throw new SupportActionError(
      'forbidden',
      'Only admins can co-sign disputes',
      403
    )
  }
  if (input.action !== 'approve' && input.action !== 'reject') {
    throw new SupportActionError('invalid_input', 'Invalid co-sign action', 400)
  }

  const db = createSupabaseAdminClient()
  const dispute = await loadDispute(db, input.disputeId)

  if (!isProposedDecision(dispute.metadata ?? {})) {
    throw new SupportActionError(
      'invalid_state',
      'Dispute has no pending co-sign proposal',
      409
    )
  }
  const proposal = dispute.metadata as DisputeProposedDecision

  if (input.action === 'reject') {
    const rejectNotes = (input.notes ?? '').trim()
    const { data: updated, error } = await db
      .from('disputes')
      .update({
        status: 'open',
        metadata: {},
      })
      .eq('id', dispute.id)
      .select('*')
      .single()
    if (error || !updated) {
      throw new SupportActionError(
        'db_error',
        `Failed to reject co-sign: ${error?.message ?? 'unknown'}`,
        500
      )
    }

    await logSupportAction({
      action: 'dispute.co_sign_rejected',
      targetType: 'dispute',
      targetId: dispute.id,
      reason: rejectNotes || undefined,
      metadata: {
        proposal,
      },
    })

    // Notify the proposing support agent.
    await notifyOne(db, proposal.proposed_actor_id, {
      type: 'system',
      subjectType: 'dispute',
      subjectId: dispute.id,
      title: 'Co-sign rejected',
      body: rejectNotes
        ? `Your proposed ${proposal.proposed_decision} decision was rejected: ${rejectNotes.slice(0, 200)}`
        : `Your proposed ${proposal.proposed_decision} decision was rejected.`,
    })

    return { dispute: updated as Dispute, status: 'executed' }
  }

  // Approve: execute the proposed decision using admin authority.
  const order = await loadOrderRow(db, dispute.order_id)
  const executed = await executeDispute(
    db,
    actor,
    dispute,
    order,
    proposal.proposed_decision,
    proposal.proposed_amount_cents,
    proposal.proposed_release_cents,
    proposal.proposed_notes,
    true
  )

  await logSupportAction({
    action: 'dispute.co_sign_approved',
    targetType: 'dispute',
    targetId: dispute.id,
    reason: proposal.proposed_notes,
    metadata: {
      proposal,
    },
  })

  // Notify the proposing support agent of approval.
  await notifyOne(db, proposal.proposed_actor_id, {
    type: 'system',
    subjectType: 'dispute',
    subjectId: dispute.id,
    title: 'Co-sign approved',
    body: `Your proposed ${proposal.proposed_decision} decision has been approved and executed.`,
  })

  return { dispute: executed, status: 'executed' }
}
