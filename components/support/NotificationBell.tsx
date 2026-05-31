'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'
import { NotificationDropdown } from '@/components/support/NotificationDropdown'
import type { SupportNotification } from '@/lib/types'

interface NotificationsPayload {
  rows: SupportNotification[]
  unreadCount: number
}

const POLL_INTERVAL_MS = 30_000

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notifications, setNotifications] = useState<SupportNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const fetchNotifications = useCallback(
    async (signal?: AbortSignal) => {
      try {
        // The bell only needs the latest 20 — `status=all` so already-read items
        // still show up in the dropdown but only the unread ones drive the badge.
        const res = await fetch('/api/support/notifications?status=all&limit=20', {
          cache: 'no-store',
          signal,
        })
        if (!res.ok) return
        const data = (await res.json()) as NotificationsPayload
        setNotifications(data.rows ?? [])
        setUnreadCount(data.unreadCount ?? 0)
      } catch (err) {
        if ((err as { name?: string } | null)?.name === 'AbortError') return
        // Polling — never surface transient errors as toasts.
        console.warn('[NotificationBell] poll failed', err)
      }
    },
    []
  )

  // Initial load + cleanup-aware polling.
  useEffect(() => {
    const controller = new AbortController()
    fetchNotifications(controller.signal)
    const handle = setInterval(() => {
      fetchNotifications()
    }, POLL_INTERVAL_MS)
    return () => {
      controller.abort()
      clearInterval(handle)
    }
  }, [fetchNotifications])

  // Click-outside to close.
  useEffect(() => {
    if (!open) return
    function handler(event: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleToggle() {
    if (!open) {
      setLoading(true)
      await fetchNotifications()
      setLoading(false)
    }
    setOpen((prev) => !prev)
  }

  async function handleMarkRead(ids: string[]) {
    if (ids.length === 0) return
    const optimistic = notifications.map((n) =>
      ids.includes(n.id) && !n.read_at
        ? { ...n, read_at: new Date().toISOString() }
        : n
    )
    const previouslyUnread = ids.filter((id) =>
      notifications.some((n) => n.id === id && !n.read_at)
    ).length
    setNotifications(optimistic)
    setUnreadCount((c) => Math.max(0, c - previouslyUnread))
    try {
      const res = await fetch('/api/support/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', ids }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
    } catch (err) {
      console.warn('[NotificationBell] mark_read failed', err)
      toast.error('Failed to mark as read')
      fetchNotifications()
    }
  }

  async function handleMarkAllRead() {
    const now = new Date().toISOString()
    const optimistic = notifications.map((n) =>
      n.read_at ? n : { ...n, read_at: now }
    )
    setNotifications(optimistic)
    setUnreadCount(0)
    try {
      const res = await fetch('/api/support/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
    } catch (err) {
      console.warn('[NotificationBell] mark_all_read failed', err)
      toast.error('Failed to mark all as read')
      fetchNotifications()
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <NotificationDropdown
          notifications={notifications}
          unreadCount={unreadCount}
          loading={loading}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  )
}
