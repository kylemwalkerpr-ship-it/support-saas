import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { searchInbox } from '@/lib/actions/support-inbox'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/dashboard/header'
import { InboxConversationList } from '@/components/support/InboxConversationList'
import { Inbox } from 'lucide-react'
import type { Profile, InboxStatus, InboxChannel } from '@/lib/types'

type SearchParams = Promise<{
  status?: string
  assignment?: string
  channel?: string
  cursor?: string
}>

const VALID_STATUSES: InboxStatus[] = ['open', 'snoozed', 'resolved']
const VALID_CHANNELS: InboxChannel[] = ['widget', 'email', 'in_app']
const VALID_ASSIGNMENTS = ['mine', 'unassigned', 'all'] as const

export default async function InboxPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const profile = await getOrCreateProfile()
  if (!profile || !['admin', 'support'].includes(profile.role)) {
    redirect('/sign-in')
  }

  const sp = await searchParams
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

  // Hydrate agent profiles for the assignee chip.
  const db = createSupabaseAdminClient()
  const agentIds = Array.from(
    new Set(conversations.map((c) => c.assigned_to).filter((id): id is string => !!id))
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
        <aside className="w-full shrink-0 border-b border-gray-200 bg-white md:w-[360px] md:border-b-0 md:border-r">
          <InboxConversationList
            initialRows={conversations}
            initialNextCursor={nextCursor}
            initialTotal={total}
            agentsById={agentsById}
            currentAgentId={profile.id}
            filters={{ status, assignment, channel }}
          />
        </aside>
        <main className="flex flex-1 items-center justify-center bg-gray-50">
          <div className="text-center text-gray-400">
            <Inbox className="mx-auto mb-3 h-10 w-10" />
            <p className="text-sm">Select a conversation to view the thread.</p>
          </div>
        </main>
      </div>
    </div>
  )
}
