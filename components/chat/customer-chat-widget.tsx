'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bot, Headphones, MessageCircle, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ChatConversation, ChatMessage } from '@/lib/types'

const STORAGE_KEY = 'yousafe_chat_conversation_id'

export function CustomerChatWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [conversation, setConversation] = useState<ChatConversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [queue, setQueue] = useState({ position: 0, estimatedWaitMinutes: 0 })
  const bottomRef = useRef<HTMLDivElement>(null)
  const hiddenOnStaffBoard = pathname.startsWith('/admin')

  const statusCopy = useMemo(() => {
    if (!conversation) return 'AI support online'
    if (conversation.status === 'waiting_for_agent') {
      return `Live queue #${queue.position || 1} · about ${queue.estimatedWaitMinutes || 4} min`
    }
    if (conversation.status === 'assigned') return 'Live agent connected'
    return 'AI support online'
  }, [conversation, queue])

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

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
        aria-label="Open Yousafe chat support"
      >
        <MessageCircle className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[620px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 text-white" style={{ background: '#3C3B6E' }}>
            <div>
              <div className="flex items-center gap-2 text-sm font-bold">
                <Bot className="h-4 w-4" />
                Yousafe Support
              </div>
              <p className="mt-0.5 text-xs text-white/75">{statusCopy}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-white/10" aria-label="Close chat">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4">
            {messages.length === 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
                Ask about services, study pathways, documents, billing, or portal help. I can answer first, or connect you to a live agent.
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex',
                  message.sender_type === 'visitor' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[82%] rounded-lg px-3 py-2 text-sm leading-relaxed',
                    message.sender_type === 'visitor'
                      ? 'bg-[#3C3B6E] text-white'
                      : message.sender_type === 'system'
                        ? 'border border-yellow-200 bg-yellow-50 text-yellow-800'
                        : 'border border-gray-200 bg-white text-gray-800'
                  )}
                >
                  <div>{message.body}</div>
                  <div className="mt-1 text-[10px] opacity-60">{message.sender_name}</div>
                </div>
              </div>
            ))}
            {loading && <div className="text-xs text-gray-500">Yousafe is typing...</div>}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-gray-200 bg-white p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mb-2 w-full"
              onClick={() => sendMessage(true)}
            >
              <Headphones className="h-4 w-4" />
              Chat with a live agent
            </Button>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                sendMessage(false)
              }}
            >
              <Input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Type your question..."
                className="h-10"
              />
              <Button type="submit" size="icon" disabled={loading || !text.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
      </>
      )}
    </>
  )
}
