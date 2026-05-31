import { NextResponse } from 'next/server'
import { openDispute } from '@/lib/actions/support-orders'
import {
  searchDisputes,
  type DisputeAgeBucket,
} from '@/lib/actions/support-disputes'
import { SupportActionError } from '@/lib/errors'
import type { DisputeStatus } from '@/lib/types'

// Phase 3 POST stays as-is. Phase 4 adds GET for the queue.

const VALID_STATUSES: DisputeStatus[] = [
  'open',
  'triage',
  'resolved_refund',
  'resolved_release',
  'resolved_split',
  'rejected',
]
const VALID_BUCKETS: DisputeAgeBucket[] = ['lt24', 'lt72', 'gt72']

function parseStatusList(values: string[]): DisputeStatus[] {
  const out: DisputeStatus[] = []
  for (const raw of values) {
    for (const piece of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
      if ((VALID_STATUSES as string[]).includes(piece)) {
        out.push(piece as DisputeStatus)
      }
    }
  }
  return out
}

interface OpenDisputeBody {
  orderId: string
  againstId: string
  againstRole: 'buyer' | 'seller'
  reason: string
}

function parseBody(raw: unknown): OpenDisputeBody {
  if (!raw || typeof raw !== 'object') {
    throw new SupportActionError('invalid_input', 'Body must be an object', 400)
  }
  const obj = raw as Record<string, unknown>
  if (typeof obj.orderId !== 'string' || !obj.orderId) {
    throw new SupportActionError('invalid_input', 'orderId is required', 400)
  }
  if (typeof obj.againstId !== 'string' || !obj.againstId) {
    throw new SupportActionError('invalid_input', 'againstId is required', 400)
  }
  if (obj.againstRole !== 'buyer' && obj.againstRole !== 'seller') {
    throw new SupportActionError(
      'invalid_input',
      'againstRole must be buyer|seller',
      400
    )
  }
  if (typeof obj.reason !== 'string') {
    throw new SupportActionError('invalid_input', 'reason is required', 400)
  }
  return {
    orderId: obj.orderId,
    againstId: obj.againstId,
    againstRole: obj.againstRole,
    reason: obj.reason,
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const statusList = parseStatusList(url.searchParams.getAll('status'))
    const ageRaw = url.searchParams.get('ageBucket')
    const ageBucket =
      ageRaw && (VALID_BUCKETS as string[]).includes(ageRaw)
        ? (ageRaw as DisputeAgeBucket)
        : undefined
    const cursor = url.searchParams.get('cursor')
    const limitRaw = url.searchParams.get('limit')
    const limit = limitRaw ? Number(limitRaw) : undefined

    const result = await searchDisputes({
      status: statusList.length ? statusList : undefined,
      ageBucket,
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
    console.error('[api/support/disputes GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => null)
    const body = parseBody(raw)
    const dispute = await openDispute(body)
    return NextResponse.json({ dispute })
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/disputes] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
