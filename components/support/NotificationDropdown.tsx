'use client'

import Link from 'next/link'
import { Check, CheckCheck } from 'lucide-react'
import type { SupportNotification } from '@/lib/types'

interface NotificationDropdownProps {
  notifications: SupportNotification[]
  unreadCount: number
  loading: boolean
  onMarkRead: (ids: string[]) => void
  onMarkAllRead: () => void
  onClose: () => void
}

function subjectHref(n: SupportNotification): string {
  if (!n.subject_id) return '/dashboard'
  switch (n.subject_type) {
    case 'dispute':
      return `/disputes/${n.subject_id}`
    case 'order':
      return `/orders/${n.subject_id}`
    case 'moderation_flag':
      return `/moderation`
    case 'conversation':
      return `/inbox/${n.subject_id}`
    case 'verification':
    case 'verification:attorney':
    case 'verification:consultant':
      return `/verifications`
    case 'profile':
      return `/users/${n.subject_id}`
    default:
      return '/dashboard'
  }
}

function relativeTime(iso: string): string {
  try {
    const delta = (Date.now() - new Date(iso).getTime()) / 1000
    if (delta < 60) return 'just now'
    if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
    if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`
    return `${Math.floor(delta / 86400)}d ago`
  } catch {
    return ''
  }
}

export function NotificationDropdown({
  notifications,
  unreadCount,
  loading,
  onMarkRead,
  onMarkAllRead,
  onClose,
}: NotificationDropdownProps) {
  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <div>
          <p className="text-sm font-semibold text-gray-900">Notifications</p>
          <p className="text-[11px] text-gray-400">
            {unreadCount} unread · last 20
          </p>
        </div>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <CheckCheck className="h-3 w-3" /> Mark all
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-6 text-center text-xs text-gray-400">
            Loading…
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-gray-400">
            You're all caught up.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {notifications.map((n) => {
              const unread = n.read_at == null
              return (
                <li
                  key={n.id}
                  className={`flex items-start gap-2 px-4 py-3 ${unread ? 'bg-blue-50/30' : 'bg-white'}`}
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={subjectHref(n)}
                      onClick={() => {
                        if (unread) onMarkRead([n.id])
                        onClose()
                      }}
                      className="block"
                    >
                      <p className="truncate text-xs font-medium text-gray-900">
                        {n.title}
                      </p>
                      {n.body ? (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">
                          {n.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">
                        {relativeTime(n.created_at)} · {n.type}
                      </p>
                    </Link>
                  </div>
                  {unread ? (
                    <button
                      type="button"
                      onClick={() => onMarkRead([n.id])}
                      title="Mark as read"
                      className="inline-flex shrink-0 items-center rounded-md border border-gray-200 p-1 text-gray-500 hover:bg-gray-50"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
