import { NextResponse } from 'next/server'
import { postSupportMessage } from '@/lib/actions/support-inbox'
import { SupportActionError } from '@/lib/actions/support-audit'

type RouteContext = { params: Promise<{ id: string }> }

interface PostMessageBody {
  body: string
  macroId?: string | null
}

function parseBody(raw: unknown): PostMessageBody {
  if (!raw || typeof raw !== 'object') {
    throw new SupportActionError('invalid_input', 'Body must be an object', 400)
  }
  const obj = raw as Record<string, unknown>
  if (typeof obj.body !== 'string') {
    throw new SupportActionError('invalid_input', 'body is required', 400)
  }
  const macroId =
    typeof obj.macroId === 'string' ? obj.macroId : obj.macroId === null ? null : undefined
  return { body: obj.body, macroId }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const raw = await request.json().catch(() => null)
    const payload = parseBody(raw)
    const message = await postSupportMessage({
      conversationId: id,
      body: payload.body,
      macroId: payload.macroId ?? null,
    })
    return NextResponse.json({ message })
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/inbox/:id/messages POST] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
