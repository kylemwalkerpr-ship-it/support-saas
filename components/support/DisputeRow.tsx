import Link from 'next/link'
import { formatRelativeDate } from '@/lib/utils'
import type { DisputeQueueRow } from '@/lib/actions/support-disputes'

interface DisputeRowProps {
  row: DisputeQueueRow
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200',
  triage: 'bg-orange-50 text-orange-700 border-orange-200',
  resolved_refund: 'bg-rose-50 text-rose-700 border-rose-200',
  resolved_release: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  resolved_split: 'bg-blue-50 text-blue-700 border-blue-200',
  rejected: 'bg-gray-50 text-gray-700 border-gray-200',
}

function slaTone(ageHours: number, status: string): {
  label: string
  cls: string
} {
  if (status !== 'open' && status !== 'triage') {
    return { label: 'closed', cls: 'bg-gray-100 text-gray-600' }
  }
  if (ageHours < 24) return { label: '<24h', cls: 'bg-emerald-100 text-emerald-800' }
  if (ageHours < 72) return { label: '<72h', cls: 'bg-amber-100 text-amber-800' }
  return { label: '>72h', cls: 'bg-rose-100 text-rose-800' }
}

function shortId(id: string): string {
  return id.slice(0, 8)
}

function formatAmount(dollars: number | null): string {
  if (dollars == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars)
}

export function DisputeRow({ row }: DisputeRowProps) {
  const ageHours = Math.max(
    0,
    (Date.now() - new Date(row.created_at).getTime()) / (60 * 60 * 1000)
  )
  const sla = slaTone(ageHours, row.status)
  const statusClass =
    STATUS_COLORS[row.status] ?? 'bg-gray-50 text-gray-700 border-gray-200'
  const reasonExcerpt = row.reason.length > 80 ? `${row.reason.slice(0, 80)}…` : row.reason
  const hasProposal =
    row.metadata && typeof row.metadata === 'object' &&
    typeof (row.metadata as Record<string, unknown>).proposed_decision === 'string'

  return (
    <Link
      href={`/disputes/${row.id}`}
      className="grid grid-cols-12 items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 text-sm transition-colors hover:border-gray-200 hover:bg-gray-50"
    >
      <div className="col-span-12 sm:col-span-2 min-w-0">
        <p className="font-mono text-xs font-medium text-gray-900 truncate">{shortId(row.id)}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClass}`}
          >
            {row.status}
          </span>
          {hasProposal && (
            <span className="inline-flex rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
              co-sign
            </span>
          )}
        </div>
      </div>

      <div className="col-span-6 sm:col-span-2 min-w-0">
        <p className="truncate text-xs text-gray-700">
          {row.order_number ?? shortId(row.order_id)}
        </p>
        <p className="text-[10px] text-gray-400">order</p>
      </div>

      <div className="col-span-6 sm:col-span-2 min-w-0">
        <p className="truncate text-xs text-gray-700">{row.buyer_label ?? '—'}</p>
        <p className="text-[10px] text-gray-400">buyer</p>
      </div>

      <div className="col-span-6 sm:col-span-2 min-w-0">
        <p className="truncate text-xs text-gray-700">{row.seller_label ?? '—'}</p>
        <p className="text-[10px] text-gray-400">seller</p>
      </div>

      <div className="col-span-6 sm:col-span-2 min-w-0">
        <p className="truncate text-xs text-gray-600" title={row.reason}>
          {reasonExcerpt}
        </p>
        <p className="text-[10px] text-gray-400">{formatAmount(row.order_total_amount)}</p>
      </div>

      <div className="col-span-12 sm:col-span-2 flex flex-col items-start gap-1 sm:items-end">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sla.cls}`}>
          SLA {sla.label}
        </span>
        <span className="text-[10px] text-gray-500">{formatRelativeDate(row.created_at)}</span>
      </div>
    </Link>
  )
}
