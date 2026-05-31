'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SlaTimer } from './SlaTimer'
import { ExternalLink, Clock, CheckCircle, Mail } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import type {
  Profile,
  ChatConversation,
  InboxStatus,
} from '@/lib/types'

interface ConversationHeaderProps {
  conversation: ChatConversation
  customerProfile: Profile | null
  agents: Profile[]
  currentAgentId: string
}

export function ConversationHeader({
  conversation,
  customerProfile,
  agents,
  currentAgentId,
}: ConversationHeaderProps) {
  const router = useRouter()
  const [pending, setPending] = React.useState<string | null>(null)
  const customerLabel =
    customerProfile?.full_name ||
    conversation.visitor_name ||
    conversation.visitor_email ||
    'Anonymous visitor'

  const agentHasReplied = !!conversation.last_agent_message_at
  const assignee = conversation.assigned_to
    ? agents.find((a) => a.id === conversation.assigned_to) ?? null
    : null

  async function patch(payload: Record<string, unknown>, optimisticToast?: string) {
    setPending(JSON.stringify(payload))
    try {
      const res = await fetch(`/api/support/inbox/${conversation.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(error || 'Request failed')
      }
      if (optimisticToast) toast.success(optimisticToast)
      router.refresh()
    } catch (err) {
      console.error('[conversation header] patch failed', err)
      toast.error((err as Error).message || 'Could not update conversation')
    } finally {
      setPending(null)
    }
  }

  function setStatus(status: InboxStatus) {
    const payload: Record<string, unknown> = { action: 'set_status', status }
    if (status === 'snoozed') {
      const hours = window.prompt('Snooze for how many hours?', '4')
      if (!hours) return
      const n = Math.max(0.25, Math.min(168, Number(hours)))
      if (!Number.isFinite(n)) return
      payload.snoozedUntil = new Date(Date.now() + n * 3_600_000).toISOString()
    }
    void patch(payload, `Marked ${status}`)
  }

  function take() {
    void patch({ action: 'take' }, 'You took this conversation')
  }
  function release() {
    void patch({ action: 'release' }, 'Released conversation')
  }
  function assignTo(toProfileId: string | null) {
    void patch({ action: 'assign', toProfileId }, toProfileId ? 'Reassigned' : 'Unassigned')
  }

  const statusToneClass: Record<InboxStatus, string> = {
    open: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    snoozed: 'bg-amber-50 text-amber-700 border-amber-200',
    resolved: 'bg-gray-100 text-gray-600 border-gray-200',
  }

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
          {getInitials(customerLabel)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-gray-900">{customerLabel}</p>
            {customerProfile && (
              <Link
                href={`/users/${customerProfile.id}`}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                360 view <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusToneClass[conversation.inbox_status]}`}
            >
              {conversation.inbox_status}
            </span>
            <SlaTimer
              lastCustomerMessageAt={conversation.last_customer_message_at}
              agentHasReplied={agentHasReplied}
            />
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {conversation.visitor_email ?? conversation.visitor_phone ?? `Topic: ${conversation.topic}`}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          Assigned to
          <select
            value={conversation.assigned_to ?? ''}
            onChange={(e) => assignTo(e.target.value === '' ? null : e.target.value)}
            disabled={!!pending}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
          >
            <option value="">— Unassigned —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name ?? a.email}
                {a.id === currentAgentId ? ' (me)' : ''}
              </option>
            ))}
          </select>
        </label>
        {assignee?.id === currentAgentId ? (
          <Button variant="outline" size="sm" onClick={release} disabled={!!pending}>
            Release
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={take} disabled={!!pending}>
            Take
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStatus('snoozed')}
          disabled={!!pending}
        >
          <Clock className="mr-1 h-3.5 w-3.5" /> Snooze
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStatus('resolved')}
          disabled={!!pending}
        >
          <CheckCircle className="mr-1 h-3.5 w-3.5" /> Resolve
        </Button>
        {conversation.inbox_status !== 'open' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStatus('open')}
            disabled={!!pending}
          >
            <Mail className="mr-1 h-3.5 w-3.5" /> Reopen
          </Button>
        )}
      </div>
    </div>
  )
}
