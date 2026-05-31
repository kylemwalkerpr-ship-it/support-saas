'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface SlaTimerProps {
  /**
   * ISO timestamp of the last customer-originated message. Drives the
   * elapsed counter. If null, the timer renders idle ("no waiting customer").
   */
  lastCustomerMessageAt: string | null
  /**
   * Whether the agent has already replied in this thread at least once.
   * Switches the threshold table from "first response" to "subsequent".
   */
  agentHasReplied: boolean
  className?: string
}

interface Thresholds {
  amberMs: number
  redMs: number
}

const FIRST_RESPONSE: Thresholds = { amberMs: 5 * 60_000, redMs: 30 * 60_000 }
const SUBSEQUENT: Thresholds = { amberMs: 30 * 60_000, redMs: 2 * 60 * 60_000 }

function formatElapsed(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms - h * 3_600_000) / 60_000)
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function SlaTimer({
  lastCustomerMessageAt,
  agentHasReplied,
  className,
}: SlaTimerProps) {
  const startedAt = lastCustomerMessageAt
    ? Date.parse(lastCustomerMessageAt)
    : null
  const [now, setNow] = React.useState<number>(() => Date.now())

  React.useEffect(() => {
    if (!startedAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  if (!startedAt) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500',
          className
        )}
      >
        SLA idle
      </span>
    )
  }

  const elapsed = Math.max(0, now - startedAt)
  const thresholds = agentHasReplied ? SUBSEQUENT : FIRST_RESPONSE

  let tone: 'green' | 'amber' | 'red'
  if (elapsed < thresholds.amberMs) tone = 'green'
  else if (elapsed < thresholds.redMs) tone = 'amber'
  else tone = 'red'

  const toneClass =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-red-200 bg-red-50 text-red-700 animate-pulse'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums',
        toneClass,
        className
      )}
      title={agentHasReplied ? 'Subsequent response SLA' : 'First response SLA'}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          tone === 'green' && 'bg-emerald-500',
          tone === 'amber' && 'bg-amber-500',
          tone === 'red' && 'bg-red-500'
        )}
      />
      {formatElapsed(elapsed)}
    </span>
  )
}
