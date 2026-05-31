import { NextResponse } from 'next/server'
import { sendOrderMessage } from '@/lib/actions/support-orders'
import { SupportActionError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

interface MessagePayload {
  to: 'buyer' | 'seller' | 'both'
  body: string
}

function parseBody(raw: unknown): MessagePayload {
  if (!raw || typeof raw !== 'object') {
    throw new SupportActionError('invalid_input', 'Body must be an object', 400)
  }
  const obj = raw as Record<string, unknown>
  const to = obj.to
  if (to !== 'buyer' && to !== 'seller' && to !== 'both') {
    throw new SupportActionError(
      'invalid_input',
      'to must be buyer|seller|both',
      400
    )
  }
  if (typeof obj.body !== 'string' || obj.body.trim().length === 0) {
    throw new SupportActionError('invalid_input', 'body is required', 400)
  }
  return { to, body: obj.body }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const raw = await request.json().catch(() => null)
    const payload = parseBody(raw)

    const result = await sendOrderMessage({
      orderId: id,
      to: payload.to,
      body: payload.body,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/orders/:id/message] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
