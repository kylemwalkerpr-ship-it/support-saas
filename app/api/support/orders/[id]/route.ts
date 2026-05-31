import { NextResponse } from 'next/server'
import {
  getOrderBundle,
  interveneExtendDeadline,
  interveneForceCancel,
} from '@/lib/actions/support-orders'
import { SupportActionError } from '@/lib/actions/support-audit'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const bundle = await getOrderBundle(id)
    return NextResponse.json(bundle)
  } catch (error) {
    return errorResponse(error)
  }
}

interface ExtendDeadlinePayload {
  action: 'extend_deadline'
  hours: number
  reason: string
}

interface ForceCancelPayload {
  action: 'force_cancel'
  reason: string
}

type PatchPayload = ExtendDeadlinePayload | ForceCancelPayload

function parsePatch(raw: unknown): PatchPayload {
  if (!raw || typeof raw !== 'object') {
    throw new SupportActionError('invalid_input', 'Body must be an object', 400)
  }
  const obj = raw as Record<string, unknown>
  if (obj.action === 'extend_deadline') {
    if (typeof obj.hours !== 'number' || !Number.isFinite(obj.hours)) {
      throw new SupportActionError('invalid_input', 'hours must be a number', 400)
    }
    if (typeof obj.reason !== 'string') {
      throw new SupportActionError('invalid_input', 'reason is required', 400)
    }
    return { action: 'extend_deadline', hours: obj.hours, reason: obj.reason }
  }
  if (obj.action === 'force_cancel') {
    if (typeof obj.reason !== 'string') {
      throw new SupportActionError('invalid_input', 'reason is required', 400)
    }
    return { action: 'force_cancel', reason: obj.reason }
  }
  throw new SupportActionError(
    'invalid_input',
    'Unknown action — refunds use POST /refund, not PATCH',
    400
  )
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => null)
    const payload = parsePatch(body)

    if (payload.action === 'extend_deadline') {
      const order = await interveneExtendDeadline({
        orderId: id,
        hours: payload.hours,
        reason: payload.reason,
      })
      return NextResponse.json({ order })
    }

    // force_cancel
    const order = await interveneForceCancel({
      orderId: id,
      reason: payload.reason,
    })
    return NextResponse.json({ order })
  } catch (error) {
    return errorResponse(error)
  }
}

function errorResponse(error: unknown) {
  if (error instanceof SupportActionError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.httpStatus }
    )
  }
  console.error('[api/support/orders/:id] unexpected error', error)
  return NextResponse.json({ error: 'Internal error' }, { status: 500 })
}
