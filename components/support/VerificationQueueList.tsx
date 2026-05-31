'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { VerificationRow } from './VerificationRow'
import type {
  VerificationQueueRow,
  VerificationType,
} from '@/lib/actions/support-verifications'

interface VerificationQueueListProps {
  rows: VerificationQueueRow[]
  type: VerificationType
}

/**
 * Client component that wraps the row list with bulk-assign UI. Kept
 * separate from the page (server component) so the selection state stays
 * client-side without forcing the whole queue page to be client-rendered.
 */
export function VerificationQueueList({
  rows,
  type,
}: VerificationQueueListProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const allChecked = rows.length > 0 && selected.size === rows.length
  const someChecked = selected.size > 0 && selected.size < rows.length

  // Bulk assign is only implemented for the attorney queue today (it's the
  // only table with an assigned_to column). For the other tabs we hide it
  // rather than ship a no-op button.
  const supportsBulkAssign = type === 'attorney'

  const selectedCount = selected.size

  const sortedRows = useMemo(() => rows, [rows])

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAll() {
    if (allChecked) {
      setSelected(new Set())
    } else {
      setSelected(new Set(rows.map((r) => r.id)))
    }
  }

  function bulkAssign() {
    if (selected.size === 0) return
    startTransition(async () => {
      try {
        const res = await fetch('/api/support/verifications/bulk-assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, ids: Array.from(selected) }),
        })
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          assigned?: number
          skipped?: number
        }
        if (!res.ok) {
          toast.error(json.error ?? 'Bulk assign failed')
          return
        }
        toast.success(
          `Assigned ${json.assigned ?? 0} to you${
            json.skipped ? ` · ${json.skipped} skipped` : ''
          }`
        )
        setSelected(new Set())
        router.refresh()
      } catch (err) {
        console.error('[VerificationQueueList] bulk assign failed', err)
        toast.error('Network error — try again')
      }
    })
  }

  if (sortedRows.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-gray-500">
          No items in this queue.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-2 text-xs">
        <label className="flex items-center gap-2 text-gray-600">
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => {
              if (el) el.indeterminate = someChecked
            }}
            onChange={toggleAll}
            className="h-4 w-4 rounded border-gray-300 text-[#3C3B6E] focus:ring-[#3C3B6E]"
          />
          {selectedCount > 0
            ? `${selectedCount} selected`
            : `Select all (${sortedRows.length})`}
        </label>

        {supportsBulkAssign && selectedCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={bulkAssign}
            disabled={isPending}
          >
            <UserCheck className="mr-1.5 h-3.5 w-3.5" />
            {isPending ? 'Assigning…' : 'Assign to me'}
          </Button>
        )}
      </div>

      <div className="hidden grid-cols-12 gap-3 px-12 text-[10px] font-medium uppercase tracking-wide text-gray-400 sm:grid">
        <div className="col-span-4">Applicant</div>
        <div className="col-span-3">Summary</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-2">Assigned</div>
        <div className="col-span-1 text-right">Age</div>
      </div>

      {sortedRows.map((r) => (
        <VerificationRow
          key={r.id}
          row={r}
          type={type}
          checked={selected.has(r.id)}
          onToggle={toggleOne}
        />
      ))}
    </div>
  )
}
