'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Download, X } from 'lucide-react'
import { toast } from 'sonner'

interface AuditFilterBarProps {
  isAdmin: boolean
  totalForExport: number
}

const ACTION_SUGGESTIONS = [
  'order.refund',
  'order.force_cancel',
  'dispute.open',
  'dispute.decide',
  'dispute.co_sign_requested',
  'dispute.co_sign_approved',
  'dispute.co_sign_rejected',
  'user.suspend',
  'user.unsuspend',
  'user.note',
  'verification.approve',
  'verification.reject',
  'verification.request_changes',
  'moderation.hide',
  'moderation.warn_user',
  'moderation.suspend_user',
  'moderation.create_system_flag',
]

const TARGET_TYPES = [
  '',
  'order',
  'dispute',
  'profile',
  'moderation_flag',
  'verification:attorney',
  'verification:consultant',
]

function isoDateInputValue(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function startOfDayIso(value: string): string | null {
  if (!value) return null
  const d = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function endOfDayIso(value: string): string | null {
  if (!value) return null
  const d = new Date(`${value}T23:59:59.999Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function AuditFilterBar({ isAdmin, totalForExport }: AuditFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initial = useMemo(
    () => ({
      actor: searchParams.get('actor') ?? '',
      action: searchParams.get('action') ?? '',
      target_type: searchParams.get('target_type') ?? '',
      dateFrom: searchParams.get('dateFrom') ?? '',
      dateTo: searchParams.get('dateTo') ?? '',
      q: searchParams.get('q') ?? '',
    }),
    [searchParams]
  )

  const [actor, setActor] = useState(initial.actor)
  const [action, setAction] = useState(initial.action)
  const [targetType, setTargetType] = useState(initial.target_type)
  const [dateFromDay, setDateFromDay] = useState(isoDateInputValue(initial.dateFrom))
  const [dateToDay, setDateToDay] = useState(isoDateInputValue(initial.dateTo))
  const [q, setQ] = useState(initial.q)
  const [exporting, setExporting] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function pushParams(next: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === '') sp.delete(k)
      else sp.set(k, v)
    }
    sp.delete('cursor') // any filter change invalidates the current cursor
    router.replace(`/audit?${sp.toString()}`)
  }

  // Free-text and actor get debounced; selects/dates push immediately.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      pushParams({ q: q || null, actor: actor || null })
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, actor])

  function clearAll() {
    setActor('')
    setAction('')
    setTargetType('')
    setDateFromDay('')
    setDateToDay('')
    setQ('')
    router.replace('/audit')
  }

  async function handleExport() {
    if (!isAdmin) return
    setExporting(true)
    try {
      const sp = new URLSearchParams()
      const fromIso = startOfDayIso(dateFromDay)
      const toIso = endOfDayIso(dateToDay)
      if (actor) sp.set('actor', actor)
      if (action) sp.set('action', action)
      if (targetType) sp.set('target_type', targetType)
      if (fromIso) sp.set('dateFrom', fromIso)
      if (toIso) sp.set('dateTo', toIso)
      if (q) sp.set('q', q)
      const res = await fetch(`/api/support/audit/export?${sp.toString()}`, {
        method: 'GET',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error || `Export failed (${res.status})`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `support-audit-${Date.now()}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Audit log exported')
    } catch (err) {
      console.error('[audit export]', err)
      toast.error('Export failed unexpectedly')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Search reason / metadata
          </label>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. chargeback, order_1234..."
            className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Actor (profile id)
          </label>
          <input
            type="text"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="UUID"
            className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Action
          </label>
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              pushParams({ action: e.target.value || null })
            }}
            className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          >
            <option value="">Any action</option>
            {ACTION_SUGGESTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Target type
          </label>
          <select
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value)
              pushParams({ target_type: e.target.value || null })
            }}
            className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          >
            {TARGET_TYPES.map((t) => (
              <option key={t || 'any'} value={t}>
                {t || 'Any target'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">From</label>
          <input
            type="date"
            value={dateFromDay}
            onChange={(e) => {
              setDateFromDay(e.target.value)
              pushParams({ dateFrom: startOfDayIso(e.target.value) })
            }}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">To</label>
          <input
            type="date"
            value={dateToDay}
            onChange={(e) => {
              setDateToDay(e.target.value)
              pushParams({ dateTo: endOfDayIso(e.target.value) })
            }}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50"
        >
          <X className="h-3 w-3" /> Clear filters
        </button>
        {isAdmin ? (
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'Exporting…' : `Export CSV (${totalForExport.toLocaleString()})`}
          </button>
        ) : (
          <span className="text-[11px] text-gray-400">CSV export is admin-only.</span>
        )}
      </div>
    </div>
  )
}
