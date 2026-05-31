import { NextResponse } from 'next/server'
import { searchUsers } from '@/lib/actions/support-users'
import { SupportActionError } from '@/lib/errors'
import type { Role, ProfileStatus } from '@/lib/types'

const ALL_ROLES: ReadonlySet<Role> = new Set<Role>([
  'client',
  'consultant',
  'support',
  'admin',
])
const ALL_STATUSES: ReadonlySet<ProfileStatus> = new Set<ProfileStatus>([
  'active',
  'pending',
  'suspended',
])

function parseRoles(values: string[]): Role[] {
  const out: Role[] = []
  for (const raw of values) {
    for (const piece of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (ALL_ROLES.has(piece as Role)) out.push(piece as Role)
    }
  }
  return out
}

function parseStatuses(values: string[]): ProfileStatus[] {
  const out: ProfileStatus[] = []
  for (const raw of values) {
    for (const piece of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (ALL_STATUSES.has(piece as ProfileStatus)) {
        out.push(piece as ProfileStatus)
      }
    }
  }
  return out
}

function parseLimit(raw: string | null): number | undefined {
  if (!raw) return undefined
  const n = Number(raw)
  if (!Number.isFinite(n)) return undefined
  return Math.min(100, Math.max(1, Math.floor(n)))
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const sp = url.searchParams

    const q = (sp.get('q') ?? '').slice(0, 64)
    const roles = parseRoles(sp.getAll('role'))
    const statuses = parseStatuses(sp.getAll('status'))
    const cursor = sp.get('cursor')
    const limit = parseLimit(sp.get('limit'))

    const result = await searchUsers({
      q: q || undefined,
      role: roles.length > 0 ? roles : undefined,
      status: statuses.length > 0 ? statuses : undefined,
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
    console.error('[api/support/users] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
