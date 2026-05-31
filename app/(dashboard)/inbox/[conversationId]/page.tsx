import { redirect, notFound } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import {
  searchInbox,
  getConversationBundle,
} from '@/lib/actions/support-inbox'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { SupportActionError } from '@/lib/actions/support-audit'
import { Header } from '@/components/dashboard/header'
import { InboxConversationList } from '@/components/support/InboxConversationList'
import { ConversationHeader } from '@/components/support/ConversationHeader'
import { MessageComposer } from '@/components/support/MessageComposer'
import { formatRelativeDate } from '@/lib/utils'
import type {
  Profile,
  InboxStatus,
  InboxChannel,
  ChatMessage,
} from '@/lib/types'

type SearchParams = Promise<{
  status?: string
  assignment?: string
  channel?: string
}>

const VALID_STATUSES: InboxStatus[] = ['open', 'snoozed', 'resolved']
const VALID_CHANNELS: InboxChannel[] = ['widget', 'email', 'in_app']
const VALID_ASSIGNMENTS = ['mine', 'unassigned', 'all'] as const

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.sender_type === 'system') {
    return (
      <div className="my-2 flex justify-center">
        <p className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
          {message.body}
        </p>
      </div>
    )
  }
  const mine = message.sender_type === 'agent'
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} my-1`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 shadow-sm ${mine ? 'bg-blue-600 text-white' : 'bg-white text-gray-900 border border-gray-200'}`}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
        <p
          className={`mt-1 text-[10px] ${mine ? 'text-blue-100' : 'text-gray-400'}`}
        >
          {message.sender_name ?? message.sender_type} · {formatRelativeDate(message.created_at)}
        </p>
      </div>
    </div>
  )
}

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>
  searchParams: SearchParams
}) {
  const profile = await getOrCreateProfile()
  if (!profile || !['admin', 'support'].includes(profile.role)) {
    redirect('/sign-in')
  }
  const { conversationId } = await params
  const sp = await searchParams

  let bundle
  try {
    bundle = await getConversationBundle(conversationId)
  } catch (err) {
    if (err instanceof SupportActionError && err.code === 'not_found') {
      notFound()
    }
    throw err
  }

  const status: InboxStatus =
    sp.status && (VALID_STATUSES as string[]).includes(sp.status)
      ? (sp.status as InboxStatus)
      : 'open'
  const assignment =
    sp.assignment && (VALID_ASSIGNMENTS as readonly string[]).includes(sp.assignment)
      ? (sp.assignment as (typeof VALID_ASSIGNMENTS)[number])
      : 'all'
  const channel =
    sp.channel && (VALID_CHANNELS as string[]).includes(sp.channel)
      ? (sp.channel as InboxChannel)
      : null

  const { conversations, nextCursor, total } = await searchInbox({
    status: [status],
    assignment,
    channel,
    limit: 50,
  })

  const db = createSupabaseAdminClient()
  const agentIds = Array.from(
    new Set([
      ...conversations.map((c) => c.assigned_to).filter((id): id is string => !!id),
      ...bundle.agents.map((a) => a.id),
    ])
  )
  const agentsById: Record<string, Profile> = {}
  if (agentIds.length > 0) {
    const { data } = await db
      .from('profiles')
      .select('*')
      .in('id', agentIds)
    for (const row of (data ?? []) as Profile[]) agentsById[row.id] = row
  }

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col md:h-screen">
      <Header
        title="Inbox"
        subtitle={`${total.toLocaleString()} matching · showing ${conversations.length}`}
      />
      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <aside className="hidden w-[360px] shrink-0 border-r border-gray-200 bg-white md:block">
          <InboxConversationList
            initialRows={conversations}
            initialNextCursor={nextCursor}
            initialTotal={total}
            activeConversationId={conversationId}
            agentsById={agentsById}
            currentAgentId={profile.id}
            filters={{ status, assignment, channel }}
          />
        </aside>
        <section className="flex flex-1 min-h-0 flex-col bg-gray-50">
          <ConversationHeader
            conversation={bundle.conversation}
            customerProfile={bundle.customerProfile}
            agents={bundle.agents}
            currentAgentId={profile.id}
          />
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {bundle.messages.length === 0 ? (
              <p className="text-center text-xs text-gray-400">No messages yet.</p>
            ) : (
              bundle.messages.map((m) => <MessageRow key={m.id} message={m} />)
            )}
          </div>
          <MessageComposer conversationId={bundle.conversation.id} />
        </section>
      </div>
    </div>
  )
}
