'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bot, Headphones, MessageCircle, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ChatConversation, ChatMessage } from '@/lib/types'
import ChatScreen from '@/components/messaging/ChatScreen'
import MessageBubble from '@/components/messaging/MessageBubble'
import AutoGrowInput from '@/components/messaging/AutoGrowInput'
import { dateLabel, sameDay } from '@/lib/messaging/format'

const STORAGE_KEY = 'yousafe_chat_conversation_id'

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim() ? value : ''
}

export function CustomerChatWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [conversation, setConversation] = useState<ChatConversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [queue, setQueue] = useState({ position: 0, estimatedWaitMinutes: 0 })
  const hiddenOnStaffBoard =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up')
  const conversationClosed =
    conversation?.status === 'closed' || conversation?.status === 'resolved'
  const agentName = metadataString(conversation?.metadata, 'assigned_agent_name')
  const agentAvatarUrl = metadataString(conversation?.metadata, 'assigned_agent_avatar_url')

  const statusCopy = useMemo(() => {
    if (!conversation) return 'AI support online'
    if (conversation.status === 'waiting_for_agent') {
      return `Live queue #${queue.position || 1} · about ${queue.estimatedWaitMinutes || 4} min`
    }
    if (conversation.status === 'assigned') {
      return agentName ? `${agentName} joined` : 'Live agent connected'
    }
    return 'AI support online'
  }, [agentName, conversation, queue])

  useEffect(() => {
    const id = localStorage.getItem(STORAGE_KEY)
    if (!id) return
    fetch(`/api/chat/widget/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.conversation) {
          setConversation(data.conversation)
          setMessages(data.messages ?? [])
          setQueue(data.queue ?? { position: 0, estimatedWaitMinutes: 0 })
        }
      })
      .catch(() => localStorage.removeItem(STORAGE_KEY))
  }, [])

  useEffect(() => {
    if (!conversation?.id) return
    const timer = window.setInterval(() => {
      fetch(`/api/chat/widget/${conversation.id}`)
        .then((r) => r.json())
        .then((data) => {
          setConversation(data.conversation)
          setMessages(data.messages ?? [])
          setQueue(data.queue ?? { position: 0, estimatedWaitMinutes: 0 })
        })
        .catch(() => {})
    }, 4000)
    return () => window.clearInterval(timer)
  }, [conversation?.id])

  async function sendMessage(requestAgent = false) {
    if (!text.trim() && !requestAgent) return
    const message = requestAgent ? 'I would like to chat with a live agent.' : text.trim()
    setText('')
    setError('')
    setLoading(true)
    try {
      const response = await fetch('/api/chat/widget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversation?.id,
          message,
          requestAgent,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data) {
        throw new Error(data?.error || 'Unable to send your message right now.')
      }
      if (data.conversation?.id) {
        localStorage.setItem(STORAGE_KEY, data.conversation.id)
        setConversation(data.conversation)
        setMessages(data.messages ?? [])
        setQueue(data.queue ?? { position: 0, estimatedWaitMinutes: 0 })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send your message right now.')
    } finally {
      setLoading(false)
    }
  }

  function startNewConversation() {
    localStorage.removeItem(STORAGE_KEY)
    setConversation(null)
    setMessages([])
    setQueue({ position: 0, estimatedWaitMinutes: 0 })
    setError('')
    setText('')
  }

  const messageNodes = useMemo(() => {
    const result: React.ReactNode[] = []
    if (messages.length === 0) {
      result.push(
        <div key="empty" className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          Ask about services, study pathways, documents, billing, or portal help. I can answer first, or connect you to a live agent.
        </div>
      )
      return result
    }
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]
      const prev = messages[i - 1]
      const showDate = !prev || !sameDay(m.created_at, prev.created_at)
      if (showDate) {
        result.push(
          <div key={`date-${m.id}`} style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', background: 'rgba(0,0,0,0.06)', padding: '4px 12px', borderRadius: 999, letterSpacing: '.02em' }}>
              {dateLabel(m.created_at)}
            </span>
          </div>
        )
      }
      if (m.sender_type === 'system') {
        result.push(
          <div key={m.id} style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
            <div style={{ maxWidth: '85%', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 999, padding: '6px 14px', color: '#6B7280', fontSize: 12, textAlign: 'center', fontWeight: 600 }}>
              {m.body}
            </div>
          </div>
        )
        continue
      }
      const mine = m.sender_type === 'visitor'
      const prevMine = prev ? prev.sender_type === 'visitor' : null
      const nextMine = messages[i + 1] ? messages[i + 1].sender_type === 'visitor' : null
      const isFirstInGroup = prevMine !== mine
      const isLastInGroup = nextMine !== mine
      result.push(
        <MessageBubble
          key={m.id}
          mine={mine}
          isFirstInGroup={isFirstInGroup}
          isLastInGroup={isLastInGroup}
          timestamp={m.created_at}
          body={m.body}
        />
      )
    }
    if (loading) {
      result.push(<div key="typing" className="text-xs text-gray-500">YouSafe is typing...</div>)
    }
    if (error) {
      result.push(
        <div key="error" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )
    }
    if (conversationClosed) {
      result.push(
        <div key="closed" className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-600">
          This conversation is {conversation?.status}. Start a new chat if you still need help.
        </div>
      )
    }
    return result
  }, [messages, loading, error, conversationClosed, conversation?.status])

  const header = (
    <div className="flex items-center justify-between px-4 py-3 text-white" style={{ background: '#3C3B6E' }}>
      <div className="flex items-center gap-3">
        {agentAvatarUrl && conversation?.status === 'assigned' ? (
          <img src={agentAvatarUrl} alt="" className="h-9 w-9 rounded-full border border-white/25 bg-white/10" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
            <Bot className="h-4 w-4" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 text-sm font-bold">
            {agentName && conversation?.status === 'assigned' ? agentName : 'YouSafe Support'}
          </div>
          <p className="mt-0.5 text-xs text-white/75">{statusCopy}</p>
        </div>
      </div>
      <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-white/10" aria-label="Close chat">
        <X className="h-5 w-5" />
      </button>
    </div>
  )

  const composer = (
    <div className="border-t border-gray-200 bg-white p-3">
      {conversationClosed ? (
        <Button type="button" variant="outline" size="sm" className="mb-2 w-full" onClick={startNewConversation}>
          New chat
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" className="mb-2 w-full" onClick={() => sendMessage(true)}>
          <Headphones className="h-4 w-4" />
          Chat with a live agent
        </Button>
      )}
      <div className="flex gap-2 items-end">
        <AutoGrowInput
          value={text}
          onChange={setText}
          onSubmit={() => sendMessage(false)}
          disabled={conversationClosed}
          placeholder="Type your question..."
        />
        <Button
          type="button"
          size="icon"
          disabled={loading || !text.trim() || conversationClosed}
          onClick={() => sendMessage(false)}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )

  return (
    <>
      {hiddenOnStaffBoard ? null : (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              'fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-2xl transition-transform hover:scale-105',
              open && 'hidden'
            )}
            style={{ background: '#3C3B6E' }}
            aria-label="Open YouSafe chat support"
          >
            <MessageCircle className="h-6 w-6" />
          </button>

          {open && (
            <div className="fixed bottom-5 right-5 z-50 flex h-[620px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
              <ChatScreen mode="panel" header={header} messages={messageNodes} composer={composer} />
            </div>
          )}
        </>
      )}
    </>
  )
}
