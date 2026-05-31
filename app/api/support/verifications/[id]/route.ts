import { NextResponse } from 'next/server'
import {
  getVerificationBundle,
  approveVerification,
  requestChangesVerification,
  rejectVerification,
  type VerificationAction,
  type VerificationType,
} from '@/lib/actions/support-verifications'
import { SupportActionError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_TYPES: VerificationType[] = ['attorney', 'consultant', 'id', 'bar']
const VALID_ACTIONS: VerificationAction[] = ['approve', 'request_changes', 'reject']

interface DecisionPayload {
  action: VerificationAction
  type: VerificationType
  notes: string
}

function parseBody(raw: unknown): DecisionPayload {
  if (!raw || typeof raw !== 'object') {
    throw new SupportActionError('invalid_input', 'Body must be an object', 400)
  }
  const obj = raw as Record<string, unknown>
  if (
    typeof obj.action !== 'string' ||
    !(VALID_ACTIONS as string[]).includes(obj.action)
  ) {
    throw new SupportActionError(
      'invalid_input',
      'action must be approve|request_changes|reject',
      400
    )
  }
  if (
    typeof obj.type !== 'string' ||
    !(VALID_TYPES as string[]).includes(obj.type)
  ) {
    throw new SupportActionError(
      'invalid_input',
      'type must be attorney|consultant|id|bar',
      400
    )
  }
  if (typeof obj.notes !== 'string') {
    throw new SupportActionError('invalid_input', 'notes is required', 400)
  }
  return {
    action: obj.action as VerificationAction,
    type: obj.type as VerificationType,
    notes: obj.notes,
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const url = new URL(request.url)
    const typeRaw = url.searchParams.get('type')
    if (!typeRaw || !(VALID_TYPES as string[]).includes(typeRaw)) {
      return NextResponse.json(
        { error: 'type query param required' },
        { status: 400 }
      )
    }
    const bundle = await getVerificationBundle({
      id,
      type: typeRaw as VerificationType,
    })
    return NextResponse.json(bundle)
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/verifications/:id GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const raw = await request.json().catch(() => null)
    const body = parseBody(raw)

    let result
    if (body.action === 'approve') {
      result = await approveVerification({ id, type: body.type, notes: body.notes })
    } else if (body.action === 'reject') {
      result = await rejectVerification({ id, type: body.type, notes: body.notes })
    } else {
      result = await requestChangesVerification({
        id,
        type: body.type,
        notes: body.notes,
      })
    }
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/verifications/:id POST] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
