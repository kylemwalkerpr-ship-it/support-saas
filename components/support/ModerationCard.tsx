'use client'

import { formatRelativeDate } from '@/lib/utils'
import type { ModerationFlagRow } from '@/lib/actions/support-moderation'

interface ModerationCardProps {
  row: ModerationFlagRow
  onOpen: (flagId: string) => void
}

const CATEGORY_COLORS: Record<string, string> = {
  spam: 'bg-amber-50 text-amber-700 border-amber-200',
  abuse: 'bg-rose-50 text-rose-700 border-rose-200',
  scam: 'bg-red-50 text-red-700 border-red-200',
  duplicate: 'bg-gray-50 text-gray-700 border-gray-200',
  other: 'bg-blue-50 text-blue-700 border-blue-200',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  dismissed: 'bg-gray-50 text-gray-700 border-gray-200',
  actioned: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const TARGET_LABELS: Record<string, string> = {
  gig: 'Gig',
  message: 'Message',
  review: 'Review',
  profile: 'Profile',
}

function shortId(id: string): string {
  return id.slice(0, 8)
}

export function ModerationCard({ row, onOpen }: ModerationCardProps) {
  const categoryClass =
    CATEGORY_COLORS[row.category] ?? 'bg-gray-50 text-gray-700 border-gray-200'
  const statusClass =
    STATUS_COLORS[row.status] ?? 'bg-gray-50 text-gray-700 border-gray-200'
  const targetLabel = TARGET_LABELS[row.target_type] ?? row.target_type
  const flaggerLabel = row.flagger_id ? row.flagger_label ?? '—' : 'system'
  const reasonExcerpt =
    row.reason.length > 100 ? `${row.reason.slice(0, 100)}…` : row.reason

  return (
    <button
      type="button"
      onClick={() => onOpen(row.id)}
      className="grid w-full grid-cols-12 items-start gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 text-left text-sm transition-colors hover:border-gray-200 hover:bg-gray-50"
    >
      <div className="col-span-12 sm:col-span-3 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-medium text-gray-900">
            {shortId(row.id)}
          </span>
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClass}`}
          >
            {row.status}
          </span>
        </div>
        <p className="mt-1 text-xs font-medium text-gray-700">
          {targetLabel}{' '}
          <span className="font-mono text-[10px] text-gray-400">
            {shortId(row.target_id)}
          </span>
        </p>
      </div>

      <div className="col-span-12 sm:col-span-5 min-w-0">
        {row.target_excerpt ? (
          <p
            className="truncate text-xs text-gray-800"
            title={row.target_excerpt}
          >
            {row.target_excerpt}
          </p>
        ) : (
          <p className="text-xs italic text-gray-400">no preview available</p>
        )}
        <p
          className="mt-0.5 truncate text-[11px] text-gray-500"
          title={row.reason}
        >
          {reasonExcerpt}
        </p>
      </div>

      <div className="col-span-6 sm:col-span-2 min-w-0">
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${categoryClass}`}
        >
          {row.category}
        </span>
        <p className="mt-1 truncate text-[10px] text-gray-500">
          by {flaggerLabel}
        </p>
      </div>

      <div className="col-span-6 sm:col-span-2 flex flex-col items-end gap-1">
        <span className="text-[10px] text-gray-500">
          {formatRelativeDate(row.created_at)}
        </span>
      </div>
    </button>
  )
}
