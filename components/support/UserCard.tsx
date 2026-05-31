import Link from 'next/link'
import { formatDate, formatRelativeDate, getInitials } from '@/lib/utils'
import type { UserDirectoryRow } from '@/lib/actions/support-users'

interface UserCardProps {
  user: UserDirectoryRow
}

const ROLE_COLORS: Record<string, string> = {
  client: 'bg-blue-50 text-blue-700 border-blue-200',
  consultant: 'bg-purple-50 text-purple-700 border-purple-200',
  support: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  admin: 'bg-amber-50 text-amber-700 border-amber-200',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
}

export function UserCard({ user }: UserCardProps) {
  const roleClass = ROLE_COLORS[user.role] ?? 'bg-gray-50 text-gray-700 border-gray-200'
  const statusClass = STATUS_COLORS[user.status] ?? 'bg-gray-50 text-gray-700 border-gray-200'

  return (
    <Link
      href={`/users/${user.id}`}
      className="grid grid-cols-12 items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 text-sm transition-colors hover:border-gray-200 hover:bg-gray-50"
    >
      <div className="col-span-12 flex items-center gap-3 sm:col-span-4">
        {user.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar_url}
            alt=""
            className="h-9 w-9 rounded-full bg-gray-100 object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
            {getInitials(user.full_name ?? user.email)}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">
            {user.full_name ?? 'Unnamed user'}
          </p>
          <p className="truncate text-xs text-gray-500">{user.email}</p>
        </div>
      </div>

      <div className="col-span-6 flex items-center gap-2 sm:col-span-2">
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${roleClass}`}
        >
          {user.role}
        </span>
      </div>

      <div className="col-span-6 flex items-center gap-2 sm:col-span-2">
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass}`}
        >
          {user.status}
        </span>
      </div>

      <div className="col-span-4 hidden text-xs text-gray-500 sm:block">
        Joined {formatDate(user.created_at)}
      </div>

      <div className="col-span-4 hidden text-xs text-gray-500 sm:block">
        {user.last_seen_at ? `Last seen ${formatRelativeDate(user.last_seen_at)}` : 'Never seen'}
      </div>

      <div className="col-span-4 text-xs text-gray-500 sm:col-span-2 sm:text-right">
        {user.order_count} order{user.order_count === 1 ? '' : 's'}
      </div>
    </Link>
  )
}
