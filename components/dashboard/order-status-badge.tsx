import { cn } from '@/lib/utils'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/types'

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold',
        ORDER_STATUS_COLORS[status]
      )}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  )
}
