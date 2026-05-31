'use client'

import Link from 'next/link'
import { SlaTimer } from './SlaTimer'
import { cn } from '@/lib/utils'
import { getInitials } from '@/lib/utils'
import type { InboxRow } from '@/lib/actions/support-inbox'
import type { Profile } from '@/lib/types'

interface InboxConversationRowProps {
  row: InboxRow
  active: boolean
  assigneeProfile?: Profile | null
}

export function InboxConversationRow({
  row,
  active,
  assigneeProfile,
}: InboxConversationRowProps) {
  const customerLabel = row.customer_label ?? 'Anonymous visitor'
  const preview =
    row.last_message?.trim() ||
    (row.last_customer_message_at ? 'Customer is waiting' : 'No messages yet')
  const agentHasReplied = !!row.last_agent_message_at

  return (
    <Link
      href={`/inbox/${row.id}`}
      className={cn(
        'group flex gap-3 border-b border-gray-100 px-4 py-3 transition-colors',
        active ? 'bg-blue-50/70' : 'hover:bg-gray-50'
      )}
    >
      <div className="relative shrink-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
          {getInitials(customerLabel)}
        </div>
        {row.unread_for_agent && (
          <span
            aria-label="Unread"
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-600"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              'truncate text-sm',
              row.unread_for_agent ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'
            )}
          >
            {customerLabel}
          </p>
          <SlaTimer
            lastCustomerMessageAt={row.last_customer_message_at}
            agentHasReplied={agentHasReplied}
          />
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500">{preview}</p>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
          {assigneeProfile ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">
              {getInitials(assigneeProfile.full_name ?? assigneeProfile.email)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-1.5 py-0.5 text-gray-500">
              Unassigned
            </span>
          )}
          <span className="capitalize">{row.inbox_status}</span>
        </div>
      </div>
    </Link>
  )
}
