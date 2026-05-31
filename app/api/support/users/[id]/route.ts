import { NextResponse } from 'next/server'
import {
  addUserNote,
  changeUserRole,
  getUserById,
  reactivateUser,
  suspendUser,
} from '@/lib/actions/support-users'
import { SupportActionError } from '@/lib/actions/support-audit'
import type { Role } from '@/lib/types'

const ALL_ROLES: ReadonlySet<Role> = new Set<Role>([
  'client',
  'consultant',
  'support',
  'admin',
])

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const bundle = await getUserById(id)
    return NextResponse.json(bundle)
  } catch (error) {
    return errorResponse(error)
  }
}

interface SuspendPayload {
  action: 'suspend'
  reason: string
}
interface ReactivatePayload {
  action: 'reactivate'
  reason: string
}
interface ChangeRolePayload {
  action: 'change_role'
  newRole: Role
  reason: string
}
interface AddNotePayload {
  action: 'add_note'
  body: string
}

type PatchPayload =
  | SuspendPayload
  | ReactivatePayload
  | ChangeRolePayload
  | AddNotePayload

function parsePatchPayload(raw: unknown): PatchPayload {
  if (!raw || typeof raw !== 'object') {
    throw new SupportActionError('invalid_input', 'Body must be an object', 400)
  }
  const obj = raw as Record<string, unknown>
  const action = obj.action

  if (action === 'suspend' || action === 'reactivate') {
    if (typeof obj.reason !== 'string') {
      throw new SupportActionError('invalid_input', 'reason is required', 400)
    }
    return { action, reason: obj.reason }
  }

  if (action === 'change_role') {
    if (typeof obj.newRole !== 'string' || !ALL_ROLES.has(obj.newRole as Role)) {
      throw new SupportActionError(
        'invalid_input',
        'newRole must be client|consultant|support|admin',
        400
      )
    }
    if (typeof obj.reason !== 'string') {
      throw new SupportActionError('invalid_input', 'reason is required', 400)
    }
    return {
      action: 'change_role',
      newRole: obj.newRole as Role,
      reason: obj.reason,
    }
  }

  if (action === 'add_note') {
    if (typeof obj.body !== 'string') {
      throw new SupportActionError('invalid_input', 'body is required', 400)
    }
    return { action: 'add_note', body: obj.body }
  }

  throw new SupportActionError(
    'invalid_input',
    `Unknown action: ${typeof action === 'string' ? action : '(missing)'}`,
    400
  )
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const raw = (await request.json().catch(() => null)) as unknown
    const payload = parsePatchPayload(raw)

    if (payload.action === 'suspend') {
      const profile = await suspendUser({ profileId: id, reason: payload.reason })
      return NextResponse.json({ profile })
    }
    if (payload.action === 'reactivate') {
      const profile = await reactivateUser({ profileId: id, reason: payload.reason })
      return NextResponse.json({ profile })
    }
    if (payload.action === 'change_role') {
      const profile = await changeUserRole({
        profileId: id,
        newRole: payload.newRole,
        reason: payload.reason,
      })
      return NextResponse.json({ profile })
    }
    if (payload.action === 'add_note') {
      const note = await addUserNote({ profileId: id, body: payload.body })
      return NextResponse.json({ note })
    }

    // Unreachable — parsePatchPayload exhausts the union.
    throw new SupportActionError('invalid_input', 'Unhandled action', 400)
  } catch (error) {
    return errorResponse(error)
  }
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof SupportActionError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.httpStatus }
    )
  }
  console.error('[api/support/users/:id] unexpected error', error)
  return NextResponse.json({ error: 'Internal error' }, { status: 500 })
}
