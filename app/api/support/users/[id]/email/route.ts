import { NextResponse } from 'next/server'
import { sendUserEmail } from '@/lib/actions/support-communications'
import { SupportActionError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

interface SendEmailBody {
  macroId: string
  subject?: string
  replyTo?: string
}

function parseBody(raw: unknown): SendEmailBody {
  if (!raw || typeof raw !== 'object') {
    throw new SupportActionError('invalid_input', 'Body must be an object', 400)
  }
  const obj = raw as Record<string, unknown>
  if (typeof obj.macroId !== 'string' || obj.macroId.length === 0) {
    throw new SupportActionError('invalid_input', 'macroId is required', 400)
  }
  const subject = typeof obj.subject === 'string' ? obj.subject : undefined
  const replyTo = typeof obj.replyTo === 'string' ? obj.replyTo : undefined
  return { macroId: obj.macroId, subject, replyTo }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const raw = (await request.json().catch(() => null)) as unknown
    const body = parseBody(raw)

    const result = await sendUserEmail({
      profileId: id,
      macroId: body.macroId,
      overrides: {
        subject: body.subject,
        replyTo: body.replyTo,
      },
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/users/:id/email] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
