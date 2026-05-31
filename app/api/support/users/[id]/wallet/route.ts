import { NextResponse } from 'next/server'
import { issueWalletCredit } from '@/lib/actions/support-wallet'
import { SupportActionError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

interface WalletCreditBody {
  amountCents: number
  memo: string
  reason: string
}

function parseBody(raw: unknown): WalletCreditBody {
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
  if (typeof obj.memo !== 'string' || obj.memo.trim().length === 0) {
    throw new SupportActionError('invalid_input', 'memo is required', 400)
  }
  if (typeof obj.reason !== 'string' || obj.reason.trim().length === 0) {
    throw new SupportActionError('invalid_input', 'reason is required', 400)
  }
  return {
    amountCents: Math.floor(amountCents),
    memo: obj.memo,
    reason: obj.reason,
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const raw = (await request.json().catch(() => null)) as unknown
    const body = parseBody(raw)

    const result = await issueWalletCredit({
      profileId: id,
      amountCents: body.amountCents,
      memo: body.memo,
      reason: body.reason,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/users/:id/wallet] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
