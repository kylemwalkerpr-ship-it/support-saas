import { NextResponse } from 'next/server'
import {
  searchVerifications,
  type VerificationType,
  type VerificationStatus,
} from '@/lib/actions/support-verifications'
import { SupportActionError } from '@/lib/actions/support-audit'

const VALID_TYPES: VerificationType[] = ['attorney', 'consultant', 'id', 'bar']
const VALID_STATUSES: VerificationStatus[] = [
  'pending',
  'approved',
  'declined',
  'changes_requested',
  'waitlist',
]

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const typeRaw = url.searchParams.get('type')
    if (!typeRaw || !(VALID_TYPES as string[]).includes(typeRaw)) {
      return NextResponse.json(
        { error: 'type query param required (attorney|consultant|id|bar)' },
        { status: 400 }
      )
    }
    const statusRaw = url.searchParams.get('status')
    const status =
      statusRaw && (VALID_STATUSES as string[]).includes(statusRaw)
        ? (statusRaw as VerificationStatus)
        : undefined
    const cursor = url.searchParams.get('cursor')
    const limitRaw = url.searchParams.get('limit')
    const limit = limitRaw ? Number(limitRaw) : undefined

    const result = await searchVerifications({
      type: typeRaw as VerificationType,
      status,
      cursor: cursor ?? undefined,
      limit,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/verifications GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
