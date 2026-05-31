'use client'

import { useState } from 'react'
import { ModerationCard } from '@/components/support/ModerationCard'
import { ModerationDetailDialog } from '@/components/support/ModerationDetailDialog'
import { AddSystemFlagDialog } from '@/components/support/AddSystemFlagDialog'
import type { ModerationFlagRow } from '@/lib/actions/support-moderation'

interface ModerationQueueListProps {
  initialRows: ModerationFlagRow[]
  totalCount: number
  isAdmin: boolean
}

export function ModerationQueueList({
  initialRows,
  totalCount,
  isAdmin,
}: ModerationQueueListProps) {
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null)

  if (initialRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
        <p className="text-sm font-medium text-gray-700">No flags in this view.</p>
        <p className="mt-1 max-w-md text-xs text-gray-500">
          Either there&apos;s nothing to triage, or your filters are too narrow.
          Adjust the tabs / chips above to widen the queue.
        </p>
        {isAdmin && (
          <div className="mt-4">
            <AddSystemFlagDialog />
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Showing {initialRows.length} of {totalCount}
        </p>
        {isAdmin && <AddSystemFlagDialog />}
      </div>

      <div className="grid gap-3">
        {initialRows.map((row) => (
          <ModerationCard
            key={row.id}
            row={row}
            onOpen={(id) => setSelectedFlagId(id)}
          />
        ))}
      </div>

      <ModerationDetailDialog
        flagId={selectedFlagId}
        onClose={() => setSelectedFlagId(null)}
      />
    </>
  )
}
