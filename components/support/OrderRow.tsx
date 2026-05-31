import Link from 'next/link'
import { formatDate, formatRelativeDate } from '@/lib/utils'
import type { PortalOrderRow } from '@/lib/actions/support-orders'

interface OrderRowProps {
  order: PortalOrderRow
  buyerLabel?: string | null
  sellerLabel?: string | null
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-50 text-gray-700 border-gray-200',
  queued: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  created: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  in_progress: 'bg-purple-50 text-purple-700 border-purple-200',
  under_review: 'bg-orange-50 text-orange-700 border-orange-200',
  revision_requested: 'bg-orange-50 text-orange-700 border-orange-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
  released: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
  refunded: 'bg-rose-50 text-rose-700 border-rose-200',
}

function formatAmount(dollars: number | null): string {
  if (dollars == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars)
}

function shortId(id: string): string {
  return id.slice(0, 8)
}

export function OrderRow({ order, buyerLabel, sellerLabel }: OrderRowProps) {
  const status = (order.status ?? 'pending').toLowerCase()
  const statusClass =
    STATUS_COLORS[status] ?? 'bg-gray-50 text-gray-700 border-gray-200'
  const lastActivity = order.updated_at ?? order.created_at

  return (
    <Link
      href={`/orders/${order.id}`}
      className="grid grid-cols-12 items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 text-sm transition-colors hover:border-gray-200 hover:bg-gray-50"
    >
      <div className="col-span-12 sm:col-span-2">
        <p className="font-mono text-xs font-medium text-gray-900">
          {order.order_number ?? shortId(order.id)}
        </p>
        <p className="font-mono text-[10px] text-gray-400">{shortId(order.id)}</p>
      </div>

      <div className="col-span-6 sm:col-span-2 min-w-0">
        <p className="truncate text-xs text-gray-700">{buyerLabel ?? order.client_id ?? '—'}</p>
        <p className="text-[10px] text-gray-400">buyer</p>
      </div>

      <div className="col-span-6 sm:col-span-2 min-w-0">
        <p className="truncate text-xs text-gray-700">{sellerLabel ?? order.consultant_id ?? '—'}</p>
        <p className="text-[10px] text-gray-400">seller</p>
      </div>

      <div className="col-span-6 sm:col-span-2 min-w-0">
        <p className="truncate text-xs text-gray-700">{order.service_title ?? '—'}</p>
      </div>

      <div className="col-span-3 sm:col-span-1 text-right text-xs font-medium text-gray-900">
        {formatAmount(order.total_amount)}
      </div>

      <div className="col-span-3 sm:col-span-1">
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClass}`}
        >
          {status}
        </span>
      </div>

      <div className="col-span-6 sm:col-span-1 text-[10px] text-gray-500">
        <p>{order.gateway ?? '—'}</p>
      </div>

      <div className="col-span-6 sm:col-span-1 text-[10px] text-gray-500">
        <p>{formatDate(order.created_at)}</p>
        <p className="text-gray-400">{formatRelativeDate(lastActivity)}</p>
      </div>
    </Link>
  )
}
