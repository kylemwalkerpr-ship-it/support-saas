import { NextResponse } from 'next/server'
import {
  searchFlags,
  createSystemFlag,
} from '@/lib/actions/support-moderation'
import { SupportActionError } from '@/lib/actions/support-audit'
import type {
  ModerationCategory,
  ModerationStatus,
  ModerationTargetType,
} from '@/lib/types'

const VALID_TARGET_TYPES: ModerationTargetType[] = [
  'gig',
  'message',
  'review',
  'profile',
]
const VALID_CATEGORIES: ModerationCategory[] = [
  'spam',
  'abuse',
  'scam',
  'duplicate',
  'other',
]
const VALID_STATUSES: ModerationStatus[] = [
  'pending',
  'dismissed',
  'actioned',
]

function parseStatusList(values: string[]): ModerationStatus[] {
  const out: ModerationStatus[] = []
  for (const raw of values) {
    for (const piece of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
      if ((VALID_STATUSES as string[]).includes(piece)) {
        out.push(piece as ModerationStatus)
      }
    }
  }
  return out
}

function parseCategoryList(values: string[]): ModerationCategory[] {
  const out: ModerationCategory[] = []
  for (const raw of values) {
    for (const piece of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
      if ((VALID_CATEGORIES as string[]).includes(piece)) {
        out.push(piece as ModerationCategory)
      }
    }
  }
  return out
}

interface CreateFlagBody {
  target_type: ModerationTargetType
  target_id: string
  reason: string
  category: ModerationCategory
}

function parseCreateBody(raw: unknown): CreateFlagBody {
  if (!raw || typeof raw !== 'object') {
    throw new SupportActionError('invalid_input', 'Body must be an object', 400)
  }
  const obj = raw as Record<string, unknown>
  if (
    typeof obj.target_type !== 'string' ||
    !(VALID_TARGET_TYPES as string[]).includes(obj.target_type)
  ) {
    throw new SupportActionError('invalid_input', 'Invalid target_type', 400)
  }
  if (typeof obj.target_id !== 'string' || !obj.target_id) {
    throw new SupportActionError('invalid_input', 'target_id is required', 400)
  }
  if (typeof obj.reason !== 'string' || !obj.reason) {
    throw new SupportActionError('invalid_input', 'reason is required', 400)
  }
  if (
    typeof obj.category !== 'string' ||
    !(VALID_CATEGORIES as string[]).includes(obj.category)
  ) {
    throw new SupportActionError('invalid_input', 'Invalid category', 400)
  }
  return {
    target_type: obj.target_type as ModerationTargetType,
    target_id: obj.target_id,
    reason: obj.reason,
    category: obj.category as ModerationCategory,
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const targetRaw = url.searchParams.get('target_type')
    const target_type =
      targetRaw && (VALID_TARGET_TYPES as string[]).includes(targetRaw)
        ? (targetRaw as ModerationTargetType)
        : undefined
    const statusList = parseStatusList(url.searchParams.getAll('status'))
    const categoryList = parseCategoryList(url.searchParams.getAll('category'))
    const cursor = url.searchParams.get('cursor')
    const limitRaw = url.searchParams.get('limit')
    const limit = limitRaw ? Number(limitRaw) : undefined

    const result = await searchFlags({
      target_type,
      status: statusList.length ? statusList : undefined,
      category: categoryList.length ? categoryList : undefined,
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
    console.error('[api/support/moderation GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => null)
    const body = parseCreateBody(raw)
    const flag = await createSystemFlag(body)
    return NextResponse.json({ flag }, { status: 201 })
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/moderation POST] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
