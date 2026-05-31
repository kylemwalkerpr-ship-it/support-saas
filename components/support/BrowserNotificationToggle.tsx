'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const KEY = 'inbox.browserNotifications'

export function BrowserNotificationToggle() {
  const [enabled, setEnabled] = React.useState(false)
  const [supported, setSupported] = React.useState(true)
  const [permission, setPermission] = React.useState<NotificationPermission>('default')

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) {
      setSupported(false)
      return
    }
    setPermission(Notification.permission)
    setEnabled(window.localStorage.getItem(KEY) === 'enabled')
  }, [])

  async function enable() {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    try {
      const next = await Notification.requestPermission()
      setPermission(next)
      if (next === 'granted') {
        window.localStorage.setItem(KEY, 'enabled')
        setEnabled(true)
        toast.success('Desktop notifications enabled')
      } else {
        toast.message('Permission not granted', {
          description: 'Enable notifications in your browser settings.',
        })
      }
    } catch (err) {
      console.error('[notifications] request failed', err)
      toast.error('Could not request permission')
    }
  }

  function disable() {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(KEY)
    setEnabled(false)
    toast.message('Desktop notifications muted')
  }

  if (!supported) {
    return (
      <p className="text-sm text-gray-500">
        Your browser does not support desktop notifications.
      </p>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-sm">
        <p className="font-medium text-gray-900">
          {enabled && permission === 'granted'
            ? 'Notifications are on'
            : 'Notifications are off'}
        </p>
        <p className="text-xs text-gray-500">
          Get a desktop alert when an assigned or unassigned customer messages you.
        </p>
      </div>
      {enabled && permission === 'granted' ? (
        <Button variant="outline" size="sm" onClick={disable}>
          Mute
        </Button>
      ) : (
        <Button size="sm" onClick={enable}>
          Enable
        </Button>
      )}
    </div>
  )
}
