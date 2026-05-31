import { NextResponse } from 'next/server'
import {
  getMacroById,
  updateMacro,
  deleteMacro,
} from '@/lib/actions/support-macros'
import { SupportActionError } from '@/lib/actions/support-audit'

type RouteContext = { params: Promise<{ id: string }> }

interface UpdateBody {
  title?: string
  body?: string
  tags?: string[]
  language?: string
  isArchived?: boolean
}

function parseUpdate(raw: unknown): UpdateBody {
  if (!raw || typeof raw !== 'object') {
    throw new SupportActionError('invalid_input', 'Body must be an object', 400)
  }
  const obj = raw as Record<string, unknown>
  const out: UpdateBody = {}
  if (typeof obj.title === 'string') out.title = obj.title
  if (typeof obj.body === 'string') out.body = obj.body
  if (Array.isArray(obj.tags) && obj.tags.every((t) => typeof t === 'string')) {
    out.tags = obj.tags as string[]
  }
  if (typeof obj.language === 'string') out.language = obj.language
  if (typeof obj.isArchived === 'boolean') out.isArchived = obj.isArchived
  return out
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const macro = await getMacroById(id)
    return NextResponse.json({ macro })
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/macros/:id GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const raw = await request.json().catch(() => null)
    const body = parseUpdate(raw)
    const macro = await updateMacro({ id, ...body })
    return NextResponse.json({ macro })
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/macros/:id PATCH] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    await deleteMacro(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/macros/:id DELETE] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
