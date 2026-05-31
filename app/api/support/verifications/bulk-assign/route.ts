import { NextResponse } from 'next/server'
import {
  bulkAssignToMe,
  type VerificationType,
} from '@/lib/actions/support-verifications'
import { SupportActionError } from '@/lib/errors'

const VALID_TYPES: VerificationType[] = ['attorney', 'consultant', 'id', 'bar']

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => null)
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'Body must be an object' }, { status: 400 })
    }
    const body = raw as Record<string, unknown>
    if (
      typeof body.type !== 'string' ||
      !(VALID_TYPES as string[]).includes(body.type)
    ) {
      return NextResponse.json(
        { error: 'type must be attorney|consultant|id|bar' },
        { status: 400 }
      )
    }
    if (!Array.isArray(body.ids)) {
      return NextResponse.json({ error: 'ids must be an array' }, { status: 400 })
    }
    const result = await bulkAssignToMe({
      type: body.type as VerificationType,
      ids: body.ids as string[],
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/verifications/bulk-assign POST] error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
