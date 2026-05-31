'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import {
  logSupportAction,
} from '@/lib/actions/support-audit'
import { SupportActionError } from '@/lib/errors'
import { fanOutToSupportAgents } from '@/lib/actions/support-notifications'
import { SUPPORT_REFUND_CAP_CENTS } from '@/lib/constants'
import { can } from '@/lib/rbac'
import type {
  Profile,
  SupportAuditLogEntry,
  Dispute,
} from '@/lib/types'

// ============================================================
// Types — Phase 3 order oversight & intervention
// ============================================================

export type OrderGateway = 'nmi' | 'authorizenet' | string

export interface PortalOrderRow {
  id: string
  order_number: string | null
  status: string | null
  total_amount: number | null
  gateway: string | null
  created_at: string
  updated_at: string | null
  delivery_deadline: string | null
  cancelled_at: string | null
  refunded_at: string | null
  refunded_amount: number | null
  client_id: string | null
  consultant_id: string | null
  service_id: string | null
  service_title: string | null
}

export interface OrderEventRow {
  id: string
  order_id: string
  actor_id: string | null
  actor_role: string | null
  from_status: string | null
  to_status: string
  note: string | null
  created_at: string
}

export interface OrderBundle {
  order: PortalOrderRow
  buyer: Profile | null
  seller: Profile | null
  events: OrderEventRow[]
  dispute: Dispute | null
}

export interface SearchOrdersInput {
  status?: string[]
  gateway?: string[]
  amountMin?: number
  amountMax?: number
  dateFrom?: string
  dateTo?: string
  hasOpenDispute?: boolean
  cursor?: string | null
  limit?: number
}

export interface SearchOrdersResult {
  orders: PortalOrderRow[]
  nextCursor: string | null
  total: number
}

export interface ExtendDeadlineInput {
  orderId: string
  hours: number
  reason: string
}

export interface ForceCancelInput {
  orderId: string
  reason: string
}

export interface SendOrderMessageInput {
  orderId: string
  to: 'buyer' | 'seller' | 'both'
  body: string
}

export interface SendOrderMessageResult {
  conversationIds: string[]
  messageIds: string[]
}

export interface OpenDisputeInput {
  orderId: string
  againstId: string
  againstRole: 'buyer' | 'seller'
  reason: string
}

export interface ProcessRefundInput {
  orderId: string
  amountCents: number
  reason: string
  gateway?: string
  outOfBand?: { method?: string; reference?: string } | null
}

export interface ProcessRefundResult {
  outOfBand: boolean
  gateway: string | null
  amountCents: number
  transactionId: string | null
  audit: SupportAuditLogEntry
}

// ============================================================
// Internal helpers
// ============================================================

const SEARCH_DEFAULT_LIMIT = 30
const SEARCH_MAX_LIMIT = 100
const REASON_MIN = 8
const REFUND_REASON_MIN = 20
const MESSAGE_BODY_MIN = 2
const MESSAGE_BODY_MAX = 4000

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

async function loadOrder(
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

  // Resolve service title best-effort.
  let serviceTitle: string | null = null
  if (data.service_id) {
    const { data: svc } = await db
      .from('services')
      .select('title')
      .eq('id', data.service_id)
      .maybeSingle()
    serviceTitle = (svc as { title?: string } | null)?.title ?? null
  }

  return { ...(data as Omit<PortalOrderRow, 'service_title'>), service_title: serviceTitle }
}

async function loadProfileById(
  db: ReturnType<typeof createSupabaseAdminClient>,
  id: string | null
): Promise<Profile | null> {
  if (!id) return null
  const { data } = await db
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return (data as Profile | null) ?? null
}

function dollarsToCents(value: number | null): number {
  if (value == null || Number.isNaN(value)) return 0
  return Math.round(value * 100)
}

// ============================================================
// searchOrders — filtered + paginated query
// ============================================================

export async function searchOrders(
  input: SearchOrdersInput
): Promise<SearchOrdersResult> {
  await requireSupportOrAdmin()
  const limit = clampLimit(input.limit)
  const cursor = decodeCursor(input.cursor)

  const db = createSupabaseAdminClient()

  let qb = db
    .from('orders')
    .select(
      'id, order_number, status, total_amount, gateway, created_at, updated_at, delivery_deadline, cancelled_at, refunded_at, refunded_amount, client_id, consultant_id, service_id',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  if (input.status && input.status.length > 0) {
    qb = qb.in('status', input.status)
  }
  if (input.gateway && input.gateway.length > 0) {
    qb = qb.in('gateway', input.gateway)
  }
  if (typeof input.amountMin === 'number' && Number.isFinite(input.amountMin)) {
    qb = qb.gte('total_amount', input.amountMin)
  }
  if (typeof input.amountMax === 'number' && Number.isFinite(input.amountMax)) {
    qb = qb.lte('total_amount', input.amountMax)
  }
  if (input.dateFrom) {
    qb = qb.gte('created_at', input.dateFrom)
  }
  if (input.dateTo) {
    qb = qb.lte('created_at', input.dateTo)
  }
  if (input.hasOpenDispute) {
    const { data: disp } = await db
      .from('disputes')
      .select('order_id')
      .in('status', ['open', 'triage'])
    const ids = ((disp ?? []) as Array<{ order_id: string }>)
      .map((r) => r.order_id)
      .filter(Boolean)
    if (ids.length === 0) {
      return { orders: [], nextCursor: null, total: 0 }
    }
    qb = qb.in('id', ids)
  }
  if (cursor) {
    qb = qb.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
    )
  }

  const { data, error, count } = await qb
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to list orders: ${error.message}`,
      500
    )
  }

  const rows = ((data ?? []) as Array<Omit<PortalOrderRow, 'service_title'>>)
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  // Hydrate service title in one batch.
  const svcIds = Array.from(
    new Set(page.map((r) => r.service_id).filter((x): x is string => !!x))
  )
  const svcTitles = new Map<string, string>()
  if (svcIds.length > 0) {
    const { data: svcRows } = await db
      .from('services')
      .select('id, title')
      .in('id', svcIds)
    for (const row of (svcRows ?? []) as Array<{ id: string; title: string }>) {
      svcTitles.set(row.id, row.title)
    }
  }

  const orders: PortalOrderRow[] = page.map((r) => ({
    ...r,
    service_title: r.service_id ? svcTitles.get(r.service_id) ?? null : null,
  }))

  const nextCursor =
    hasMore && page.length > 0
      ? encodeCursor({
          created_at: page[page.length - 1].created_at,
          id: page[page.length - 1].id,
        })
      : null

  return { orders, nextCursor, total: count ?? orders.length }
}

// ============================================================
// getOrderBundle — single-order detail page
// ============================================================

export async function getOrderBundle(orderId: string): Promise<OrderBundle> {
  await requireSupportOrAdmin()
  const db = createSupabaseAdminClient()
  const order = await loadOrder(db, orderId)

  const [buyer, seller, eventsRes, disputeRes] = await Promise.all([
    loadProfileById(db, order.client_id),
    loadProfileById(db, order.consultant_id),
    db
      .from('order_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
      .limit(200),
    db
      .from('disputes')
      .select('*')
      .eq('order_id', orderId)
      .in('status', ['open', 'triage'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return {
    order,
    buyer,
    seller,
    events: ((eventsRes.data ?? []) as OrderEventRow[]),
    dispute: ((disputeRes.data as Dispute | null) ?? null),
  }
}

// ============================================================
// Conversation helper — get-or-create + post system message
// ============================================================

async function postSystemMessage(
  db: ReturnType<typeof createSupabaseAdminClient>,
  params: {
    actorId: string
    participantA: string
    participantB: string
    orderId: string
    body: string
  }
): Promise<{ conversationId: string; messageId: string }> {
  const { data: convId, error: convErr } = await db.rpc(
    'get_or_create_conversation',
    {
      p_a: params.participantA,
      p_b: params.participantB,
      p_context_kind: 'order',
      p_context_id: params.orderId,
    }
  )
  if (convErr || !convId) {
    throw new SupportActionError(
      'db_error',
      `get_or_create_conversation failed: ${convErr?.message ?? 'no id'}`,
      500
    )
  }

  // The conversation row trigger only updates last_message_*; we still need a
  // valid sender_id. Use the support actor's own profile id as the author and
  // mark the message system-tagged via metadata.system + a sender label.
  const { data: msg, error: msgErr } = await db
    .from('conversation_messages')
    .insert({
      conversation_id: convId,
      sender_id: params.actorId,
      type: 'system',
      body: params.body,
      ref_order_id: params.orderId,
      metadata: {
        system: true,
        support_actor_id: params.actorId,
        sender_label: 'YouSafe Support',
      },
    })
    .select('id')
    .single()

  if (msgErr || !msg) {
    throw new SupportActionError(
      'db_error',
      `Failed to insert system message: ${msgErr?.message ?? 'unknown'}`,
      500
    )
  }
  return { conversationId: convId as string, messageId: (msg as { id: string }).id }
}

// ============================================================
// sendOrderMessage — post into buyer and/or seller conversation
// ============================================================

export async function sendOrderMessage(
  input: SendOrderMessageInput
): Promise<SendOrderMessageResult> {
  const actor = await requireSupportOrAdmin()
  const body = (input.body ?? '').trim()
  if (body.length < MESSAGE_BODY_MIN) {
    throw new SupportActionError('invalid_input', 'Message body too short', 400)
  }
  if (body.length > MESSAGE_BODY_MAX) {
    throw new SupportActionError('invalid_input', 'Message body too long', 400)
  }
  if (!['buyer', 'seller', 'both'].includes(input.to)) {
    throw new SupportActionError('invalid_input', 'Invalid recipient target', 400)
  }

  const db = createSupabaseAdminClient()
  const order = await loadOrder(db, input.orderId)

  const targets: Array<'buyer' | 'seller'> =
    input.to === 'both' ? ['buyer', 'seller'] : [input.to]

  const conversationIds: string[] = []
  const messageIds: string[] = []

  for (const t of targets) {
    const counterpart = t === 'buyer' ? order.client_id : order.consultant_id
    if (!counterpart) continue
    if (counterpart === actor.id) continue // get_or_create rejects self-conv

    const res = await postSystemMessage(db, {
      actorId: actor.id,
      participantA: actor.id,
      participantB: counterpart,
      orderId: order.id,
      body,
    })
    conversationIds.push(res.conversationId)
    messageIds.push(res.messageId)
  }

  await logSupportAction({
    action: 'order.message',
    targetType: 'order',
    targetId: order.id,
    metadata: {
      to: input.to,
      conversation_ids: conversationIds,
      message_ids: messageIds,
      body_excerpt: body.slice(0, 200),
    },
  })

  return { conversationIds, messageIds }
}

// ============================================================
// interveneExtendDeadline — bumps orders.delivery_deadline
// ============================================================

export async function interveneExtendDeadline(
  input: ExtendDeadlineInput
): Promise<PortalOrderRow> {
  await requireSupportOrAdmin()
  const reason = (input.reason ?? '').trim()
  if (reason.length < REASON_MIN) {
    throw new SupportActionError(
      'invalid_input',
      `Reason must be at least ${REASON_MIN} characters`,
      400
    )
  }
  const hours = Math.floor(Number(input.hours))
  if (!Number.isFinite(hours) || hours <= 0 || hours > 720) {
    throw new SupportActionError(
      'invalid_input',
      'hours must be a positive integer up to 720',
      400
    )
  }

  const db = createSupabaseAdminClient()
  const order = await loadOrder(db, input.orderId)

  const baseTs = order.delivery_deadline ? new Date(order.delivery_deadline) : new Date()
  const next = new Date(baseTs.getTime() + hours * 60 * 60 * 1000)

  const { data, error } = await db
    .from('orders')
    .update({ delivery_deadline: next.toISOString() })
    .eq('id', order.id)
    .select(
      'id, order_number, status, total_amount, gateway, created_at, updated_at, delivery_deadline, cancelled_at, refunded_at, refunded_amount, client_id, consultant_id, service_id'
    )
    .single()

  if (error || !data) {
    throw new SupportActionError(
      'db_error',
      `Failed to extend deadline: ${error?.message ?? 'unknown'}`,
      500
    )
  }

  await logSupportAction({
    action: 'order.extend_deadline',
    targetType: 'order',
    targetId: order.id,
    reason,
    metadata: {
      hours,
      prior_deadline: order.delivery_deadline,
      new_deadline: next.toISOString(),
    },
  })

  return { ...(data as Omit<PortalOrderRow, 'service_title'>), service_title: order.service_title }
}

// ============================================================
// interveneForceCancel — sets status=cancelled + notifies parties
// ============================================================

export async function interveneForceCancel(
  input: ForceCancelInput
): Promise<PortalOrderRow> {
  const actor = await requireSupportOrAdmin()
  const reason = (input.reason ?? '').trim()
  if (reason.length < REASON_MIN) {
    throw new SupportActionError(
      'invalid_input',
      `Reason must be at least ${REASON_MIN} characters`,
      400
    )
  }

  const db = createSupabaseAdminClient()
  const order = await loadOrder(db, input.orderId)

  const { data, error } = await db
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .select(
      'id, order_number, status, total_amount, gateway, created_at, updated_at, delivery_deadline, cancelled_at, refunded_at, refunded_amount, client_id, consultant_id, service_id'
    )
    .single()

  if (error || !data) {
    throw new SupportActionError(
      'db_error',
      `Failed to cancel order: ${error?.message ?? 'unknown'}`,
      500
    )
  }

  // Best-effort dual-side system message. Failure to message does not undo
  // the cancellation — log the partial state in audit metadata.
  let messageError: string | null = null
  try {
    for (const counterpart of [order.client_id, order.consultant_id]) {
      if (!counterpart || counterpart === actor.id) continue
      await postSystemMessage(db, {
        actorId: actor.id,
        participantA: actor.id,
        participantB: counterpart,
        orderId: order.id,
        body: `This order has been cancelled by YouSafe Support. Reason: ${reason}`,
      })
    }
  } catch (err) {
    messageError = err instanceof Error ? err.message : 'unknown'
    console.warn('[interveneForceCancel] message dispatch failed', messageError)
  }

  await logSupportAction({
    action: 'order.force_cancel',
    targetType: 'order',
    targetId: order.id,
    reason,
    metadata: {
      prior_status: order.status,
      message_error: messageError,
    },
  })

  return { ...(data as Omit<PortalOrderRow, 'service_title'>), service_title: order.service_title }
}

// ============================================================
// openDispute — minimal insert (triage UI ships in Phase 4)
// ============================================================

export async function openDispute(input: OpenDisputeInput): Promise<Dispute> {
  const actor = await requireSupportOrAdmin()
  const reason = (input.reason ?? '').trim()
  if (reason.length < REASON_MIN) {
    throw new SupportActionError(
      'invalid_input',
      `Reason must be at least ${REASON_MIN} characters`,
      400
    )
  }
  if (!input.againstId) {
    throw new SupportActionError('invalid_input', 'againstId is required', 400)
  }
  if (input.againstRole !== 'buyer' && input.againstRole !== 'seller') {
    throw new SupportActionError(
      'invalid_input',
      'againstRole must be buyer|seller',
      400
    )
  }

  const db = createSupabaseAdminClient()
  const order = await loadOrder(db, input.orderId)

  // Resolve canonical roles. The dispute table stores `against_role` as the
  // platform role (client | consultant); UI sends buyer/seller and we map.
  const againstRole = input.againstRole === 'buyer' ? 'client' : 'consultant'
  const openedByRole = actor.role

  const { data, error } = await db
    .from('disputes')
    .insert({
      order_id: order.id,
      opened_by: actor.id,
      opened_by_role: openedByRole,
      against_id: input.againstId,
      against_role: againstRole,
      reason,
      status: 'open',
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new SupportActionError(
      'db_error',
      `Failed to open dispute: ${error?.message ?? 'unknown'}`,
      500
    )
  }

  await logSupportAction({
    action: 'dispute.open',
    targetType: 'dispute',
    targetId: (data as { id: string }).id,
    reason,
    metadata: {
      order_id: order.id,
      against_id: input.againstId,
      against_role: againstRole,
    },
  })

  // Phase 9 — fan out a new-dispute notification to all support+admin agents.
  // Exclude the actor who just opened it; they don't need a self-notification.
  try {
    await fanOutToSupportAgents({
      type: 'new_dispute',
      subjectType: 'dispute',
      subjectId: (data as { id: string }).id,
      title: 'New dispute opened',
      body: `Dispute on order ${order.order_number ?? order.id.slice(0, 8)}: ${reason.slice(0, 200)}`,
      excludeProfileId: actor.id,
    })
  } catch (err) {
    // Notification fan-out must never block dispute creation.
    console.warn('[openDispute] notification fan-out failed', err)
  }

  return data as Dispute
}

// ============================================================
// processRefund — threshold guard + gateway dispatch + audit
// ============================================================

export async function processRefund(
  input: ProcessRefundInput
): Promise<ProcessRefundResult> {
  const actor = await requireSupportOrAdmin()
  const reason = (input.reason ?? '').trim()
  if (reason.length < REFUND_REASON_MIN) {
    throw new SupportActionError(
      'invalid_input',
      `Reason must be at least ${REFUND_REASON_MIN} characters`,
      400
    )
  }
  const amountCents = Math.floor(Number(input.amountCents))
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new SupportActionError(
      'invalid_input',
      'amountCents must be a positive integer',
      400
    )
  }

  const db = createSupabaseAdminClient()
  const order = await loadOrder(db, input.orderId)
  const maxCents = dollarsToCents(order.total_amount)
  if (maxCents <= 0) {
    throw new SupportActionError(
      'invalid_input',
      'Order has no positive total_amount to refund against',
      422
    )
  }
  if (amountCents > maxCents) {
    throw new SupportActionError(
      'amount_exceeds_order',
      `Refund (${amountCents}¢) exceeds order total (${maxCents}¢)`,
      400
    )
  }

  // Centralised via rbac.can() — preserves the legacy
  // `requires_admin_co_sign` semantic which the dialog UI keys on,
  // rather than collapsing to a generic forbidden response.
  if (!can(actor.role, 'order.refund', { amountCents })) {
    throw new SupportActionError(
      'requires_admin_co_sign',
      `Refunds above ${SUPPORT_REFUND_CAP_CENTS}¢ require admin co-sign`,
      402
    )
  }

  const gateway = (input.gateway ?? order.gateway ?? '').toString() || null
  const outOfBand = Boolean(input.outOfBand)
  let transactionId: string | null = null

  if (!outOfBand) {
    const token = process.env.PORTAL_SERVICE_TOKEN
    if (!token) {
      throw new SupportActionError(
        'config_missing',
        'PORTAL_SERVICE_TOKEN is not configured; cannot dispatch in-band refund',
        500
      )
    }
    if (!gateway) {
      throw new SupportActionError(
        'invalid_input',
        'gateway is required for in-band refunds',
        400
      )
    }

    let portalRes: Response
    try {
      // Portal endpoint accepts Bearer service-token auth (PORTAL_SERVICE_TOKEN
      // env var, paired with SUPPORT_SAAS_SYSTEM_PROFILE_ID for attribution).
      // The path is /api/admin/escrow/[orderId]/refund — handles escrow
      // accounting + wallet credit + audit + gateway-aware refund routing.
      portalRes = await fetch(
        `https://portal.yousafeconsultancy.com/api/admin/escrow/${encodeURIComponent(order.id)}/refund`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            amountCents,
            reason,
            gateway,
          }),
        }
      )
    } catch (err) {
      throw new SupportActionError(
        'gateway_unreachable',
        `Portal refund endpoint unreachable: ${err instanceof Error ? err.message : 'unknown'}`,
        502
      )
    }

    const portalBody = (await portalRes.json().catch(() => ({}))) as {
      success?: boolean
      gatewayRefundTx?: string
      ledgerId?: string
      error?: string
    }

    if (!portalRes.ok || portalBody.success === false) {
      throw new SupportActionError(
        'gateway_refund_failed',
        portalBody.error ?? `Portal refund failed (HTTP ${portalRes.status})`,
        portalRes.status >= 400 && portalRes.status < 600 ? portalRes.status : 502
      )
    }

    transactionId = portalBody.gatewayRefundTx ?? portalBody.ledgerId ?? null

    // Best-effort: record refunded_at / refunded_amount on the order row.
    await db
      .from('orders')
      .update({
        refunded_at: new Date().toISOString(),
        refunded_amount: amountCents / 100,
        refund_id: transactionId,
        refund_status: 'succeeded',
        refund_method: 'original_payment',
      })
      .eq('id', order.id)
  } else {
    // Out-of-band: nothing to call. Just mark the order.
    transactionId =
      input.outOfBand && typeof input.outOfBand.reference === 'string'
        ? input.outOfBand.reference
        : null
    await db
      .from('orders')
      .update({
        refunded_at: new Date().toISOString(),
        refunded_amount: amountCents / 100,
        refund_id: transactionId,
        refund_status: 'succeeded',
        refund_method: 'wallet',
      })
      .eq('id', order.id)
  }

  const audit = await logSupportAction({
    action: 'order.refund',
    targetType: 'order',
    targetId: order.id,
    reason,
    metadata: {
      amountCents,
      gateway,
      outOfBand,
      transactionId,
      method: outOfBand ? (input.outOfBand?.method ?? 'manual') : 'original_payment',
      external_reference: input.outOfBand?.reference ?? null,
    },
  })

  return { outOfBand, gateway, amountCents, transactionId, audit }
}
