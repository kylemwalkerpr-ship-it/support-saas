import { NextResponse } from 'next/server'
import {
  getDisputeTriageBundle,
  decideDispute,
  cosignDispute,
  type DisputeDecision,
} from '@/lib/actions/support-disputes'
import { SupportActionError } from '@/lib/actions/support-audit'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_DECISIONS: DisputeDecision[] = [
  'refund_full',
  'refund_partial',
  'release',
  'split',
  'reject',
]

interface DecidePayload {
  action: 'decide'
  decision: DisputeDecision
  amountCents?: number
  releaseCents?: number
  notes: string
}

interface CosignPayload {
  action: 'cosign'
  cosignAction: 'approve' | 'reject'
  notes?: string
}

type Payload = DecidePayload | CosignPayload

function parsePayload(raw: unknown): Payload {
  if (!raw || typeof raw !== 'object') {
    throw new SupportActionError('invalid_input', 'Body must be an object', 400)
  }
  const obj = raw as Record<string, unknown>
  if (obj.action === 'decide') {
    const decision = obj.decision
    if (typeof decision !== 'string' || !(VALID_DECISIONS as string[]).includes(decision)) {
      throw new SupportActionError('invalid_input', 'Invalid decision', 400)
    }
    if (typeof obj.notes !== 'string') {
      throw new SupportActionError('invalid_input', 'notes is required', 400)
    }
    let amountCents: number | undefined
    let releaseCents: number | undefined
    if (obj.amountCents != null) {
      const n = Number(obj.amountCents)
      if (!Number.isFinite(n) || n <= 0) {
        throw new SupportActionError(
          'invalid_input',
          'amountCents must be a positive number',
          400
        )
      }
      amountCents = Math.floor(n)
    }
    if (obj.releaseCents != null) {
      const n = Number(obj.releaseCents)
      if (!Number.isFinite(n) || n <= 0) {
        throw new SupportActionError(
          'invalid_input',
          'releaseCents must be a positive number',
          400
        )
      }
      releaseCents = Math.floor(n)
    }
    return {
      action: 'decide',
      decision: decision as DisputeDecision,
      amountCents,
      releaseCents,
      notes: obj.notes,
    }
  }
  if (obj.action === 'cosign') {
    if (obj.cosignAction !== 'approve' && obj.cosignAction !== 'reject') {
      throw new SupportActionError(
        'invalid_input',
        'cosignAction must be approve|reject',
        400
      )
    }
    const notes = typeof obj.notes === 'string' ? obj.notes : undefined
    return { action: 'cosign', cosignAction: obj.cosignAction, notes }
  }
  throw new SupportActionError('invalid_input', 'Unknown action', 400)
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const bundle = await getDisputeTriageBundle(id)
    return NextResponse.json(bundle)
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/disputes/:id GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const raw = await request.json().catch(() => null)
    const payload = parsePayload(raw)

    if (payload.action === 'decide') {
      const result = await decideDispute({
        disputeId: id,
        decision: payload.decision,
        amountCents: payload.amountCents,
        releaseCents: payload.releaseCents,
        notes: payload.notes,
      })
      const httpStatus = result.status === 'awaiting_co_sign' ? 202 : 200
      return NextResponse.json(result, { status: httpStatus })
    }
    const result = await cosignDispute({
      disputeId: id,
      action: payload.cosignAction,
      notes: payload.notes,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/disputes/:id PATCH] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
