import { NextResponse } from 'next/server'
import {
  getFlagBundle,
  decideFlag,
  type ModerationDecisionAction,
} from '@/lib/actions/support-moderation'
import { SupportActionError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_ACTIONS: ModerationDecisionAction[] = [
  'dismiss',
  'hide',
  'warn_user',
  'suspend_user',
]

interface DecidePayload {
  action: ModerationDecisionAction
  notes?: string
  userId?: string
}

function parsePayload(raw: unknown): DecidePayload {
  if (!raw || typeof raw !== 'object') {
    throw new SupportActionError('invalid_input', 'Body must be an object', 400)
  }
  const obj = raw as Record<string, unknown>
  const action = obj.action
  if (
    typeof action !== 'string' ||
    !(VALID_ACTIONS as string[]).includes(action)
  ) {
    throw new SupportActionError('invalid_input', 'Invalid action', 400)
  }
  const notes = typeof obj.notes === 'string' ? obj.notes : undefined
  const userId = typeof obj.userId === 'string' ? obj.userId : undefined

  if ((action === 'warn_user' || action === 'suspend_user') && !userId) {
    throw new SupportActionError(
      'invalid_input',
      'userId is required for warn_user / suspend_user',
      400
    )
  }
  if (action === 'hide' && !notes) {
    throw new SupportActionError(
      'invalid_input',
      'notes is required for hide',
      400
    )
  }

  return {
    action: action as ModerationDecisionAction,
    notes,
    userId,
  }
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const bundle = await getFlagBundle(id)
    return NextResponse.json(bundle)
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/moderation/:id GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const raw = await request.json().catch(() => null)
    const payload = parsePayload(raw)

    const result = await decideFlag({
      flagId: id,
      decision: payload.action,
      notes: payload.notes,
      userId: payload.userId,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/moderation/:id PATCH] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
