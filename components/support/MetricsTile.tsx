import Link from 'next/link'
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MetricsTileProps {
  title: string
  value: string | number
  delta?: string | null
  href: string
  icon: LucideIcon
  iconColor?: string
  iconBg?: string
}

/**
 * Presentational tile for the agent home dashboard. Deep-links to the
 * relevant queue page. Phase 9 will add real deltas; for now `delta` is
 * an optional subtitle string.
 */
export function MetricsTile({
  title,
  value,
  delta,
  href,
  icon: Icon,
  iconColor = 'text-blue-600',
  iconBg = 'bg-blue-50',
}: MetricsTileProps) {
  return (
    <Link
      href={href}
      className="group block rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {delta ? <p className="text-xs text-gray-400">{delta}</p> : null}
        </div>
        <div className={cn('rounded-xl p-3', iconBg)}>
          <Icon className={cn('h-6 w-6', iconColor)} />
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-gray-400 group-hover:text-gray-600">
        View →
      </p>
    </Link>
  )
}
