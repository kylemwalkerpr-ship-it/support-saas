import { NextResponse } from 'next/server'
import {
  listMacros,
  createMacro,
  type ListMacrosInput,
} from '@/lib/actions/support-macros'
import { SupportActionError } from '@/lib/errors'

const VALID_SCOPES = ['mine', 'team', 'all'] as const

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const scopeRaw = url.searchParams.get('scope')
    const scope =
      scopeRaw && (VALID_SCOPES as readonly string[]).includes(scopeRaw)
        ? (scopeRaw as ListMacrosInput['scope'])
        : 'all'
    const tag = url.searchParams.get('tag')
    const language = url.searchParams.get('language')
    const search = url.searchParams.get('search')

    const macros = await listMacros({
      scope,
      tag: tag ?? null,
      language: language ?? null,
      search: search ?? null,
    })
    return NextResponse.json({ macros })
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/macros GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

interface CreateBody {
  title: string
  body: string
  tags?: string[]
  language?: string
  isTeamWide?: boolean
}

function parseCreate(raw: unknown): CreateBody {
  if (!raw || typeof raw !== 'object') {
    throw new SupportActionError('invalid_input', 'Body must be an object', 400)
  }
  const obj = raw as Record<string, unknown>
  if (typeof obj.title !== 'string') {
    throw new SupportActionError('invalid_input', 'title is required', 400)
  }
  if (typeof obj.body !== 'string') {
    throw new SupportActionError('invalid_input', 'body is required', 400)
  }
  const tags =
    Array.isArray(obj.tags) && obj.tags.every((t) => typeof t === 'string')
      ? (obj.tags as string[])
      : undefined
  const language = typeof obj.language === 'string' ? obj.language : undefined
  const isTeamWide = typeof obj.isTeamWide === 'boolean' ? obj.isTeamWide : undefined
  return { title: obj.title, body: obj.body, tags, language, isTeamWide }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => null)
    const body = parseCreate(raw)
    const macro = await createMacro(body)
    return NextResponse.json({ macro }, { status: 201 })
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/macros POST] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
