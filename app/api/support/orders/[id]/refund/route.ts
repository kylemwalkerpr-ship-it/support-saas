import { NextResponse } from 'next/server'
import { processRefund } from '@/lib/actions/support-orders'
import { SupportActionError } from '@/lib/actions/support-audit'

type RouteContext = { params: Promise<{ id: string }> }

interface RefundBody {
  amountCents: number
  reason: string
  gateway?: string
  outOfBand?: { method?: string; reference?: string } | null
}

function parseBody(raw: unknown): RefundBody {
  if (!raw || typeof raw !== 'object') {
    throw new SupportActionError('invalid_input', 'Body must be an object', 400)
  }
  const obj = raw as Record<string, unknown>

  const amountCents = Number(obj.amountCents)
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new SupportActionError(
      'invalid_input',
      'amountCents must be a positive number',
      400
    )
  }
  if (typeof obj.reason !== 'string' || obj.reason.trim().length === 0) {
    throw new SupportActionError('invalid_input', 'reason is required', 400)
  }
  const gateway = typeof obj.gateway === 'string' ? obj.gateway : undefined

  let outOfBand: RefundBody['outOfBand'] = null
  if (obj.outOfBand && typeof obj.outOfBand === 'object') {
    const oob = obj.outOfBand as Record<string, unknown>
    outOfBand = {
      method: typeof oob.method === 'string' ? oob.method : undefined,
      reference: typeof oob.reference === 'string' ? oob.reference : undefined,
    }
  }

  return { amountCents, reason: obj.reason, gateway, outOfBand }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const raw = await request.json().catch(() => null)
    const body = parseBody(raw)

    const result = await processRefund({
      orderId: id,
      amountCents: Math.floor(body.amountCents),
      reason: body.reason,
      gateway: body.gateway,
      outOfBand: body.outOfBand,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/orders/:id/refund] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
