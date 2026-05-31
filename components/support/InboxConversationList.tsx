'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { InboxConversationRow } from './InboxConversationRow'
import { Button } from '@/components/ui/button'
import { Inbox, RefreshCw } from 'lucide-react'
import type { InboxRow } from '@/lib/actions/support-inbox'
import type {
  Profile,
  InboxStatus,
  InboxChannel,
  ChatConversation,
} from '@/lib/types'

interface InboxConversationListProps {
  initialRows: InboxRow[]
  initialNextCursor: string | null
  initialTotal: number
  activeConversationId?: string | null
  agentsById: Record<string, Profile>
  currentAgentId: string
  filters: {
    status: InboxStatus
    assignment: 'mine' | 'unassigned' | 'all'
    channel: InboxChannel | null
  }
}

function mergeRows(prev: InboxRow[], incoming: InboxRow): InboxRow[] {
  const idx = prev.findIndex((r) => r.id === incoming.id)
  if (idx >= 0) {
    const next = prev.slice()
    next[idx] = { ...prev[idx], ...incoming }
    return next.sort((a, b) => {
      const ta = a.last_customer_message_at
        ? Date.parse(a.last_customer_message_at)
        : 0
      const tb = b.last_customer_message_at
        ? Date.parse(b.last_customer_message_at)
        : 0
      return tb - ta
    })
  }
  return [incoming, ...prev]
}

function rowFromConversation(conv: ChatConversation): InboxRow {
  return {
    ...conv,
    customer_label:
      conv.visitor_name || conv.visitor_email || conv.visitor_phone || null,
    unread_for_agent:
      !!conv.last_customer_message_at &&
      (!conv.last_agent_message_at ||
        Date.parse(conv.last_customer_message_at) >
          Date.parse(conv.last_agent_message_at)),
  }
}

export function InboxConversationList({
  initialRows,
  initialNextCursor,
  initialTotal,
  activeConversationId,
  agentsById,
  currentAgentId,
  filters,
}: InboxConversationListProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [rows, setRows] = React.useState<InboxRow[]>(initialRows)
  const [cursor, setCursor] = React.useState<string | null>(initialNextCursor)
  const [loadingMore, setLoadingMore] = React.useState(false)

  // Re-sync local state when the server sends new initial data (filter change).
  React.useEffect(() => {
    setRows(initialRows)
    setCursor(initialNextCursor)
  }, [initialRows, initialNextCursor])

  React.useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    try {
      channel = supabase
        .channel('support-inbox')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_conversations' },
          (payload: { new?: unknown; old?: unknown }) => {
            const next = payload.new as ChatConversation | undefined
            if (!next) return
            // Apply filter client-side: if the row no longer matches the
            // current view, drop it from the list.
            if (next.inbox_status !== filters.status) {
              setRows((prev) => prev.filter((r) => r.id !== next.id))
              return
            }
            if (filters.assignment === 'mine' && next.assigned_to !== currentAgentId) {
              setRows((prev) => prev.filter((r) => r.id !== next.id))
              return
            }
            if (filters.assignment === 'unassigned' && next.assigned_to !== null) {
              setRows((prev) => prev.filter((r) => r.id !== next.id))
              return
            }
            setRows((prev) => mergeRows(prev, rowFromConversation(next)))
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages' },
          (payload: { new?: unknown }) => {
            const next = payload.new as
              | { conversation_id: string; sender_type: string }
              | undefined
            if (!next || next.sender_type !== 'visitor') return
            // Only toast if this conversation is relevant to the current view
            // (assigned to me or unassigned).
            const row = rows.find((r) => r.id === next.conversation_id)
            if (row && (row.assigned_to === currentAgentId || row.assigned_to === null)) {
              toast.info('New customer message', {
                description: row.customer_label ?? 'A waiting customer wrote in',
                action: {
                  label: 'Open',
                  onClick: () => router.push(`/inbox/${row.id}`),
                },
              })
              // Best-effort browser notification (gated on permission)
              if (
                typeof window !== 'undefined' &&
                'Notification' in window &&
                Notification.permission === 'granted' &&
                window.localStorage.getItem('inbox.browserNotifications') === 'enabled'
              ) {
                try {
                  new Notification('New customer message', {
                    body: row.customer_label ?? 'Inbox',
                    tag: `inbox-${row.id}`,
                  })
                } catch {
                  /* swallow */
                }
              }
            }
          }
        )
        .subscribe()
    } catch (err) {
      console.warn('[inbox] realtime subscription failed', err)
    }
    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel)
        } catch {
          /* swallow */
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.assignment, currentAgentId])

  function setFilter(key: 'status' | 'assignment' | 'channel', value: string | null) {
    const next = new URLSearchParams(searchParams?.toString() ?? '')
    if (value) next.set(key, value)
    else next.delete(key)
    router.push(`${pathname}?${next.toString()}`)
  }

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const next = new URLSearchParams(searchParams?.toString() ?? '')
      next.set('cursor', cursor)
      const res = await fetch(`/api/support/inbox?${next.toString()}`)
      if (!res.ok) throw new Error('Failed to load more')
      const json = (await res.json()) as {
        conversations: InboxRow[]
        nextCursor: string | null
      }
      setRows((prev) => [...prev, ...json.conversations])
      setCursor(json.nextCursor)
    } catch (err) {
      console.error('[inbox] loadMore failed', err)
      toast.error('Could not load more conversations')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">
            Inbox <span className="text-xs font-normal text-gray-500">({initialTotal})</span>
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.refresh()}
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {(['open', 'snoozed', 'resolved'] as InboxStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter('status', s === 'open' ? null : s)}
              className={`rounded-full border px-2 py-0.5 capitalize ${filters.status === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
          {(['mine', 'unassigned', 'all'] as const).map((a) => (
            <button
              key={a}
              onClick={() => setFilter('assignment', a === 'all' ? null : a)}
              className={`rounded-full border px-2 py-0.5 capitalize ${filters.assignment === a ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
            <Inbox className="mb-3 h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-700">All caught up</p>
            <p className="mt-1 text-xs text-gray-500">
              No conversations match the current filter.
            </p>
          </div>
        ) : (
          <>
            {rows.map((row) => (
              <InboxConversationRow
                key={row.id}
                row={row}
                active={row.id === activeConversationId}
                assigneeProfile={row.assigned_to ? agentsById[row.assigned_to] ?? null : null}
              />
            ))}
            {cursor && (
              <div className="p-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
