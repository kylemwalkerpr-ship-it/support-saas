'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Eye,
  Headphones,
  Inbox,
  Mail,
  Send,
  Sparkles,
  UserCheck,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  assignConversation,
  assignNextConversation,
  clearClosedConversations,
  clearWaitingQueue,
  closeConversation,
  escalateConversation,
  markConversationRead,
  resolveConversation,
  sendAgentMessage,
} from '@/lib/actions/chat'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { ChatConversation, ChatMessage } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ChatScreen from '@/components/messaging/ChatScreen'
import MessageBubble from '@/components/messaging/MessageBubble'
import AutoGrowInput from '@/components/messaging/AutoGrowInput'
import { dateLabel, sameDay } from '@/lib/messaging/format'

interface SupportDashboardData {
  conversations: ChatConversation[]
  messages: ChatMessage[]
  notifications: { id: string; target_email: string; title: string; message: string; created_at: string }[]
  metrics: {
    open: number
    waiting: number
    aiHandled: number
    resolved: number
    availableAgents: number
    estimatedWaitMinutes: number
  }
}

export function SupportDashboard({ initialData }: { initialData: SupportDashboardData }) {
  const [data, setData] = useState(initialData)
  const [selectedId, setSelectedId] = useState(initialData.conversations[0]?.id ?? '')
  const [reply, setReply] = useState('')
  const [isPending, startTransition] = useTransition()

  const selected = useMemo(
    () => data.conversations.find((conversation) => conversation.id === selectedId) ?? data.conversations[0],
    [data.conversations, selectedId]
  )
  const selectedMessages = useMemo(
    () => data.messages.filter((message) => message.conversation_id === selected?.id),
    [data.messages, selected?.id]
  )
  const waiting = data.conversations.filter((conversation) => conversation.status === 'waiting_for_agent')
  const selectedIsRead = Boolean(selected?.metadata?.read_at)

  async function refresh(showToast = false) {
    const response = await fetch('/api/chat/conversations')
    const next = await response.json()
    if (!response.ok) {
      if (showToast) toast.error(next.error || 'Unable to refresh chat data')
      return
    }
    setData(next)
    if (showToast) toast.success('Chat queue refreshed')
  }

  useEffect(() => {
    const channel = supabase
      .channel('support-chat-ops')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_notifications' }, () => refresh())
      .subscribe()

    const timer = window.setInterval(() => refresh(), 5000)
    return () => {
      window.clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [])

  function runAction(action: () => Promise<unknown>, success: string | ((result: unknown) => string)) {
    startTransition(async () => {
      try {
        const result = await action()
        await refresh()
        toast.success(typeof success === 'function' ? success(result) : success)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Action failed')
      }
    })
  }

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3C3B6E] text-white">
                <Headphones className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-950">Support Chat Console</h1>
                <p className="text-xs text-gray-500">AI triage, live queue, and customer conversations</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {['support@yousafeconsultancy.com', 'admin@yousafeconsultancy.com', 'info@yousafeconsultancy.com'].map((email) => (
              <Badge key={email} variant="secondary" className="max-w-full gap-1 truncate bg-gray-100 text-gray-700">
                <Mail className="h-3 w-3" />
                {email}
              </Badge>
            ))}
            <Button variant="outline" size="sm" onClick={() => refresh(true)}>
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending || waiting.length === 0}
              onClick={() => runAction(() => assignNextConversation(), 'Next waiting chat assigned')}
            >
              Join next
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending || waiting.length === 0}
              onClick={() =>
                runAction(
                  () => clearWaitingQueue(),
                  (result) => `${Number(result) || 0} waiting chat${Number(result) === 1 ? '' : 's'} cleared`
                )
              }
            >
              Clear queue
            </Button>
          </div>
        </div>
      </header>

      <main className="grid min-w-0 gap-4 p-4 sm:p-6 xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
            <Metric label="Open" value={data.metrics.open} icon={Inbox} />
            <Metric label="Waiting" value={data.metrics.waiting} icon={Clock} tone="amber" />
            <Metric label="AI Active" value={data.metrics.aiHandled} icon={Sparkles} tone="indigo" />
            <Metric label="Resolved" value={data.metrics.resolved} icon={CheckCircle2} tone="green" />
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="p-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">Live queue</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending || waiting.length === 0}
                  onClick={() =>
                    runAction(
                      () => clearWaitingQueue(),
                      (result) => `${Number(result) || 0} waiting chat${Number(result) === 1 ? '' : 's'} cleared`
                    )
                  }
                >
                  Clear
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Expected wait: {data.metrics.estimatedWaitMinutes} minutes
              </p>
            </CardHeader>
            <CardContent className="space-y-2 p-2 pt-0">
              {data.conversations.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                  No customer messages yet.
                </div>
              )}
              {data.conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelectedId(conversation.id)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors',
                    selected?.id === conversation.id
                      ? 'border-[#3C3B6E] bg-[#3C3B6E]/5'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-semibold text-gray-950">
                      {conversation.visitor_name || conversation.visitor_email || 'Website visitor'}
                    </div>
                    <StatusBadge status={conversation.status} />
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-gray-500">{conversation.last_message}</div>
                </button>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="h-[560px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm xl:h-[720px]">
          {selected ? (
            <ChatScreen
              mode="fill"
              header={
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4 bg-white">
                  <div>
                    <h2 className="font-bold text-gray-950">
                      {selected.visitor_name || selected.visitor_email || 'Website visitor'}
                    </h2>
                    <p className="text-xs text-gray-500">
                      {selected.visitor_email || 'No email captured'} · {selected.topic}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedIsRead && <Badge variant="outline">Read</Badge>}
                    <StatusBadge status={selected.status} />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending || selected.status === 'closed'}
                      onClick={() => runAction(() => markConversationRead(selected.id), 'Ticket marked read')}
                    >
                      <Eye className="h-4 w-4" />
                      Read
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending || selected.status === 'closed' || selected.status === 'resolved'}
                      onClick={() => runAction(() => assignConversation(selected.id), 'Conversation assigned')}
                    >
                      <UserCheck className="h-4 w-4" />
                      Join
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => runAction(() => escalateConversation(selected.id), 'Ticket escalated')}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      Escalate
                    </Button>
                    <Button
                      size="sm"
                      disabled={isPending || selected.status === 'closed' || selected.status === 'resolved'}
                      onClick={() => runAction(() => resolveConversation(selected.id), 'Conversation resolved')}
                    >
                      Resolve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending || selected.status === 'closed'}
                      onClick={() => runAction(() => closeConversation(selected.id), 'Ticket closed')}
                    >
                      <XCircle className="h-4 w-4" />
                      Close
                    </Button>
                  </div>
                </div>
              }
              messages={
                <>
                  {selectedMessages.map((message, i) => {
                    const prev = selectedMessages[i - 1]
                    const parts: React.ReactNode[] = []
                    const showDate = !prev || !sameDay(message.created_at, prev.created_at)
                    if (showDate) {
                      parts.push(
                        <div key={`date-${message.id}`} style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', background: 'rgba(0,0,0,0.06)', padding: '4px 12px', borderRadius: 999, letterSpacing: '.02em' }}>
                            {dateLabel(message.created_at)}
                          </span>
                        </div>
                      )
                    }
                    if (message.sender_type === 'system') {
                      parts.push(
                        <div key={message.id} style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
                          <div style={{ maxWidth: '85%', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 999, padding: '6px 14px', color: '#78350F', fontSize: 12, textAlign: 'center', fontWeight: 600 }}>
                            {message.body}
                          </div>
                        </div>
                      )
                    } else {
                      const mine = message.sender_type === 'agent'
                      const prevMine = prev ? prev.sender_type === 'agent' : null
                      const nextMine = selectedMessages[i + 1] ? selectedMessages[i + 1].sender_type === 'agent' : null
                      const isFirstInGroup = prevMine !== mine
                      const isLastInGroup = nextMine !== mine
                      parts.push(
                        <MessageBubble
                          key={message.id}
                          mine={mine}
                          isFirstInGroup={isFirstInGroup}
                          isLastInGroup={isLastInGroup}
                          timestamp={message.created_at}
                          body={message.body}
                        />
                      )
                    }
                    return parts
                  })}
                </>
              }
              composer={
                <div className="border-t border-gray-200 bg-white p-4">
                  {selected.status === 'closed' || selected.status === 'resolved' ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                      This conversation is {selected.status}. Reopen by escalating it if the visitor needs more help.
                    </div>
                  ) : (
                    <>
                      <AutoGrowInput
                        value={reply}
                        onChange={setReply}
                        onSubmit={() => {
                          if (!reply.trim() || !selected) return
                          const body = reply.trim()
                          setReply('')
                          runAction(() => sendAgentMessage(selected.id, body), 'Reply sent')
                        }}
                        placeholder="Reply as YouSafe Support..."
                      />
                      <div className="mt-3 flex justify-end">
                        <Button
                          disabled={isPending || !reply.trim()}
                          onClick={() => {
                            if (!reply.trim() || !selected) return
                            const body = reply.trim()
                            setReply('')
                            runAction(() => sendAgentMessage(selected.id, body), 'Reply sent')
                          }}
                        >
                          <Send className="h-4 w-4" />
                          Send reply
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-500">
              Select a conversation to begin.
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm">AI support mode</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 text-sm text-gray-600">
              <div className="rounded-lg bg-indigo-50 p-3 text-indigo-900">
                AI answers system-wide questions first and escalates when a customer requests a live agent or asks about account-specific issues.
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="font-bold text-gray-950">{waiting.length}</div>
                  <div className="text-gray-500">In queue</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="font-bold text-gray-950">{data.metrics.availableAgents}</div>
                  <div className="text-gray-500">Agents online</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">Notifications</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    isPending ||
                    data.conversations.every(
                      (conversation) => conversation.status !== 'closed' && conversation.status !== 'resolved'
                    )
                  }
                  onClick={() =>
                    runAction(
                      () => clearClosedConversations(),
                      (result) => `${Number(result) || 0} closed chat${Number(result) === 1 ? '' : 's'} removed`
                    )
                  }
                >
                  Clear closed
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
              {data.notifications.slice(0, 8).map((notification) => (
                <div key={notification.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="text-xs font-bold text-gray-950">{notification.title}</div>
                  <div className="mt-1 text-xs text-gray-500">{notification.target_email}</div>
                  <div className="mt-2 line-clamp-2 text-xs text-gray-600">{notification.message}</div>
                </div>
              ))}
              {data.notifications.length === 0 && (
                <div className="text-sm text-gray-500">No support notifications yet.</div>
              )}
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  )
}

function Metric({
  label,
  value,
  icon: Icon,
  tone = 'blue',
}: {
  label: string
  value: number
  icon: typeof Inbox
  tone?: 'blue' | 'amber' | 'green' | 'indigo'
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-green-50 text-green-700',
    indigo: 'bg-indigo-50 text-indigo-700',
  }
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-gray-950">{value}</div>
            <div className="text-xs font-medium text-gray-500">{label}</div>
          </div>
          <div className={cn('rounded-lg p-2', tones[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: ChatConversation['status'] }) {
  const map = {
    ai_active: ['AI', 'secondary'],
    waiting_for_agent: ['Waiting', 'warning'],
    assigned: ['Live', 'default'],
    resolved: ['Resolved', 'success'],
    closed: ['Closed', 'outline'],
  } as const
  const [label, variant] = map[status]
  return <Badge variant={variant}>{label}</Badge>
}
