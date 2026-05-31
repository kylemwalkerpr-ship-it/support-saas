'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type {
  VerificationQueueRow,
  VerificationType,
} from '@/lib/actions/support-verifications'

interface VerificationRowProps {
  row: VerificationQueueRow
  type: VerificationType
  checked: boolean
  onToggle: (id: string, checked: boolean) => void
}

function statusTone(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-50 text-amber-700'
    case 'approved':
      return 'bg-emerald-50 text-emerald-700'
    case 'declined':
      return 'bg-rose-50 text-rose-700'
    case 'changes_requested':
      return 'bg-sky-50 text-sky-700'
    case 'waitlist':
      return 'bg-slate-50 text-slate-700'
    default:
      return 'bg-gray-50 text-gray-700'
  }
}

function ageTone(days: number): string {
  if (days >= 7) return 'text-rose-600'
  if (days >= 3) return 'text-amber-600'
  return 'text-gray-500'
}

export function VerificationRow({
  row,
  type,
  checked,
  onToggle,
}: VerificationRowProps) {
  const href = `/verifications/${row.id}?type=${type}`

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onToggle(row.id, e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 shrink-0 rounded border-gray-300 text-[#3C3B6E] focus:ring-[#3C3B6E]"
            aria-label="Select for bulk action"
          />
          <Link
            href={href}
            className="grid min-w-0 flex-1 grid-cols-12 items-center gap-3"
          >
            <div className="col-span-12 sm:col-span-4">
              <p className="truncate text-sm font-medium text-gray-900">
                {row.full_name ?? row.email ?? row.id.slice(0, 8)}
              </p>
              {row.email && row.full_name && (
                <p className="truncate text-xs text-gray-500">{row.email}</p>
              )}
            </div>
            <div className="col-span-6 sm:col-span-3">
              <p className="truncate text-xs text-gray-600">
                {row.summary ?? <span className="text-gray-300">—</span>}
              </p>
            </div>
            <div className="col-span-3 sm:col-span-2">
              <span
                className={
                  'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ' +
                  statusTone(row.status)
                }
              >
                {row.status}
              </span>
            </div>
            <div className="col-span-2 sm:col-span-2">
              <p className="truncate text-xs text-gray-600">
                {row.assigned_label ? (
                  row.assigned_label
                ) : (
                  <span className="text-gray-300">unassigned</span>
                )}
              </p>
            </div>
            <div className={'col-span-1 text-right text-xs ' + ageTone(row.age_days)}>
              {row.age_days}d
            </div>
          </Link>
          <ChevronRight className="hidden h-4 w-4 shrink-0 text-gray-300 sm:block" />
        </div>
      </CardContent>
    </Card>
  )
}
