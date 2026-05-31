import Link from 'next/link'
import { AuditDetailExpander } from '@/components/support/AuditDetailExpander'
import type { AuditSearchRow } from '@/lib/actions/support-audit-viewer'

function actionBadgeColor(action: string): string {
  const head = action.split('.')[0]
  switch (head) {
    case 'order':
    case 'dispute':
      return 'bg-rose-50 text-rose-700 border-rose-100'
    case 'user':
      return 'bg-blue-50 text-blue-700 border-blue-100'
    case 'moderation':
      return 'bg-amber-50 text-amber-700 border-amber-100'
    case 'verification':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100'
    case 'macro':
      return 'bg-purple-50 text-purple-700 border-purple-100'
    default:
      return 'bg-gray-50 text-gray-700 border-gray-100'
  }
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

function targetLink(targetType: string, targetId: string): string | null {
  if (!targetId) return null
  switch (targetType) {
    case 'profile':
    case 'user':
      return `/users/${targetId}`
    case 'order':
      return `/orders/${targetId}`
    case 'dispute':
      return `/disputes/${targetId}`
    case 'moderation_flag':
      return `/moderation`
    default:
      return null
  }
}

function truncate(value: string | null, max = 120): string {
  if (!value) return '—'
  if (value.length <= max) return value
  return `${value.slice(0, max).trim()}…`
}

interface AuditLogTableProps {
  rows: AuditSearchRow[]
}

export function AuditLogTable({ rows }: AuditLogTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No audit events match these filters.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <th className="px-4 py-3">When</th>
            <th className="px-4 py-3">Actor</th>
            <th className="px-4 py-3">Action</th>
            <th className="px-4 py-3">Target</th>
            <th className="px-4 py-3">Reason</th>
            <th className="px-4 py-3">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const link = targetLink(row.target_type, row.target_id)
            return (
              <tr key={row.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                  {formatTimestamp(row.created_at)}
                </td>
                <td className="px-4 py-3 text-xs">
                  <Link
                    href={`/users/${row.actor_id}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {row.actor_email ?? row.actor_name ?? row.actor_id.slice(0, 8)}
                  </Link>
                  <p className="text-[11px] text-gray-400">{row.actor_role}</p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${actionBadgeColor(row.action)}`}
                  >
                    {row.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  <p className="text-gray-500">{row.target_type}</p>
                  {link ? (
                    <Link
                      href={link}
                      className="font-mono text-[11px] text-blue-700 hover:underline"
                    >
                      {row.target_id.slice(0, 12)}
                    </Link>
                  ) : (
                    <span className="font-mono text-[11px] text-gray-700">
                      {row.target_id.slice(0, 12)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-700">
                  {truncate(row.reason)}
                </td>
                <td className="px-4 py-3">
                  <AuditDetailExpander metadata={row.metadata} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
