import { NextResponse } from 'next/server'
import { openDispute } from '@/lib/actions/support-orders'
import { SupportActionError } from '@/lib/actions/support-audit'

// Phase 3: minimal POST to insert a dispute row. The queue/triage UI
// (GET + PATCH) ships in Phase 4.

interface OpenDisputeBody {
  orderId: string
  againstId: string
  againstRole: 'buyer' | 'seller'
  reason: string
}

function parseBody(raw: unknown): OpenDisputeBody {
  if (!raw || typeof raw !== 'object') {
    throw new SupportActionError('invalid_input', 'Body must be an object', 400)
  }
  const obj = raw as Record<string, unknown>
  if (typeof obj.orderId !== 'string' || !obj.orderId) {
    throw new SupportActionError('invalid_input', 'orderId is required', 400)
  }
  if (typeof obj.againstId !== 'string' || !obj.againstId) {
    throw new SupportActionError('invalid_input', 'againstId is required', 400)
  }
  if (obj.againstRole !== 'buyer' && obj.againstRole !== 'seller') {
    throw new SupportActionError(
      'invalid_input',
      'againstRole must be buyer|seller',
      400
    )
  }
  if (typeof obj.reason !== 'string') {
    throw new SupportActionError('invalid_input', 'reason is required', 400)
  }
  return {
    orderId: obj.orderId,
    againstId: obj.againstId,
    againstRole: obj.againstRole,
    reason: obj.reason,
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => null)
    const body = parseBody(raw)
    const dispute = await openDispute(body)
    return NextResponse.json({ dispute })
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/disputes] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
