import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { searchUsers } from '@/lib/actions/support-users'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent } from '@/components/ui/card'
import { UserSearchInput } from '@/components/support/UserSearchInput'
import { UserCard } from '@/components/support/UserCard'
import type { Role, ProfileStatus } from '@/lib/types'

const ALL_ROLES: Role[] = ['client', 'consultant', 'support', 'admin']
const ALL_STATUSES: ProfileStatus[] = ['active', 'pending', 'suspended']

function asStringArray(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : value.split(',')
}

function parseRoles(value: string | string[] | undefined): Role[] {
  return asStringArray(value)
    .map((v) => v.trim())
    .filter((v): v is Role => (ALL_ROLES as string[]).includes(v))
}

function parseStatuses(value: string | string[] | undefined): ProfileStatus[] {
  return asStringArray(value)
    .map((v) => v.trim())
    .filter((v): v is ProfileStatus => (ALL_STATUSES as string[]).includes(v))
}

type SearchParams = Promise<{
  q?: string
  role?: string | string[]
  status?: string | string[]
  cursor?: string
}>

export default async function UsersPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const profile = await getOrCreateProfile()
  if (!profile || !['support', 'admin'].includes(profile.role)) {
    redirect('/sign-in')
  }

  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q.slice(0, 64) : ''
  const roles = parseRoles(params.role)
  const statuses = parseStatuses(params.status)
  const cursor = typeof params.cursor === 'string' ? params.cursor : null

  const { users, nextCursor, total } = await searchUsers({
    q: q || undefined,
    role: roles.length ? roles : undefined,
    status: statuses.length ? statuses : undefined,
    cursor: cursor ?? undefined,
    limit: 50,
  })

  const baseSp = new URLSearchParams()
  if (q) baseSp.set('q', q)
  for (const r of roles) baseSp.append('role', r)
  for (const s of statuses) baseSp.append('status', s)

  function withCursor(c: string | null): string {
    const sp = new URLSearchParams(baseSp.toString())
    if (c) sp.set('cursor', c)
    const qs = sp.toString()
    return qs ? `/users?${qs}` : '/users'
  }

  return (
    <div>
      <Header
        title="Users"
        subtitle={`${total.toLocaleString()} total · showing ${users.length}`}
      />

      <div className="space-y-4 p-6">
        <Card>
          <CardContent className="space-y-4 p-4">
            <UserSearchInput />
            <FilterChips roles={roles} statuses={statuses} q={q} />
          </CardContent>
        </Card>

        <div className="space-y-2">
          <div className="hidden grid-cols-12 gap-3 px-4 text-xs font-medium uppercase tracking-wide text-gray-400 sm:grid">
            <div className="col-span-4">User</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-4 grid grid-cols-3 gap-3">
              <div>Joined</div>
              <div>Last seen</div>
              <div className="text-right">Orders</div>
            </div>
          </div>

          {users.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-gray-500">
                No users match these filters. Try a different search.
              </CardContent>
            </Card>
          ) : (
            users.map((u) => <UserCard key={u.id} user={u} />)
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Showing {users.length} of {total.toLocaleString()}
          </span>
          {nextCursor ? (
            <Link
              href={withCursor(nextCursor)}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
            >
              Load older →
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function FilterChips({
  roles,
  statuses,
  q,
}: {
  roles: Role[]
  statuses: ProfileStatus[]
  q: string
}) {
  if (!q && roles.length === 0 && statuses.length === 0) {
    return (
      <p className="text-xs text-gray-400">
        Showing the 50 most recently joined profiles. Type to search; deeper
        filters arrive in phase 10.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {q && (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
          q: {q}
        </span>
      )}
      {roles.map((r) => (
        <span
          key={r}
          className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700"
        >
          role: {r}
        </span>
      ))}
      {statuses.map((s) => (
        <span
          key={s}
          className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700"
        >
          status: {s}
        </span>
      ))}
    </div>
  )
}
