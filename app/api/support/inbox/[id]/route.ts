import { NextResponse } from 'next/server'
import {
  getConversationBundle,
  takeConversation,
  releaseConversation,
  assignConversation,
  setConversationStatus,
} from '@/lib/actions/support-inbox'
import { SupportActionError } from '@/lib/errors'
import type { InboxStatus } from '@/lib/types'

type RouteContext = { params: Promise<{ id: string }> }

type Payload =
  | { action: 'take' }
  | { action: 'release' }
  | { action: 'assign'; toProfileId: string | null }
  | {
      action: 'set_status'
      status: InboxStatus
      snoozedUntil?: string
    }

const VALID_STATUSES: InboxStatus[] = ['open', 'snoozed', 'resolved']

function parsePayload(raw: unknown): Payload {
  if (!raw || typeof raw !== 'object') {
    throw new SupportActionError('invalid_input', 'Body must be an object', 400)
  }
  const obj = raw as Record<string, unknown>
  if (obj.action === 'take' || obj.action === 'release') {
    return { action: obj.action }
  }
  if (obj.action === 'assign') {
    if (obj.toProfileId !== null && typeof obj.toProfileId !== 'string') {
      throw new SupportActionError(
        'invalid_input',
        'toProfileId must be string or null',
        400
      )
    }
    return { action: 'assign', toProfileId: obj.toProfileId }
  }
  if (obj.action === 'set_status') {
    if (
      typeof obj.status !== 'string' ||
      !(VALID_STATUSES as string[]).includes(obj.status)
    ) {
      throw new SupportActionError(
        'invalid_input',
        'status must be open|snoozed|resolved',
        400
      )
    }
    const snoozedUntil =
      typeof obj.snoozedUntil === 'string' ? obj.snoozedUntil : undefined
    return {
      action: 'set_status',
      status: obj.status as InboxStatus,
      snoozedUntil,
    }
  }
  throw new SupportActionError('invalid_input', 'Unknown action', 400)
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const bundle = await getConversationBundle(id)
    return NextResponse.json(bundle)
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/inbox/:id GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const raw = await request.json().catch(() => null)
    const payload = parsePayload(raw)

    if (payload.action === 'take') {
      const conversation = await takeConversation({ conversationId: id })
      return NextResponse.json({ conversation })
    }
    if (payload.action === 'release') {
      const conversation = await releaseConversation({ conversationId: id })
      return NextResponse.json({ conversation })
    }
    if (payload.action === 'assign') {
      const conversation = await assignConversation({
        conversationId: id,
        toProfileId: payload.toProfileId,
      })
      return NextResponse.json({ conversation })
    }
    const conversation = await setConversationStatus({
      conversationId: id,
      status: payload.status,
      snoozedUntil: payload.snoozedUntil ?? null,
    })
    return NextResponse.json({ conversation })
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/inbox/:id PATCH] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
