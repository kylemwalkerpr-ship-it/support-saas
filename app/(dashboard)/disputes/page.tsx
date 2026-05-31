import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import {
  searchDisputes,
  type DisputeAgeBucket,
} from '@/lib/actions/support-disputes'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent } from '@/components/ui/card'
import { DisputeRow } from '@/components/support/DisputeRow'
import type { DisputeStatus } from '@/lib/types'

function asStringArray(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : value.split(',')
}

const VALID_STATUSES: DisputeStatus[] = [
  'open',
  'triage',
  'resolved_refund',
  'resolved_release',
  'resolved_split',
  'rejected',
]
const VALID_BUCKETS: DisputeAgeBucket[] = ['lt24', 'lt72', 'gt72']

type SearchParams = Promise<{
  status?: string | string[]
  ageBucket?: string
  cursor?: string
}>

export default async function DisputesQueuePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const profile = await getOrCreateProfile()
  if (!profile || !['support', 'admin'].includes(profile.role)) {
    redirect('/sign-in')
  }

  const sp = await searchParams
  const status = asStringArray(sp.status)
    .map((s) => s.trim())
    .filter((s): s is DisputeStatus =>
      (VALID_STATUSES as string[]).includes(s)
    )
  const ageBucket =
    sp.ageBucket && (VALID_BUCKETS as string[]).includes(sp.ageBucket)
      ? (sp.ageBucket as DisputeAgeBucket)
      : undefined
  const cursor = typeof sp.cursor === 'string' ? sp.cursor : null

  const { rows, nextCursor, total } = await searchDisputes({
    status: status.length ? status : undefined,
    ageBucket,
    cursor: cursor ?? undefined,
    limit: 50,
  })

  const baseSp = new URLSearchParams()
  for (const v of status) baseSp.append('status', v)
  if (ageBucket) baseSp.set('ageBucket', ageBucket)

  function withCursor(c: string | null): string {
    const out = new URLSearchParams(baseSp.toString())
    if (c) out.set('cursor', c)
    const qs = out.toString()
    return qs ? `/disputes?${qs}` : '/disputes'
  }

  return (
    <div>
      <Header
        title="Disputes"
        subtitle={`${total.toLocaleString()} matching · showing ${rows.length}`}
      />

      <div className="space-y-4 p-6">
        <Card>
          <CardContent className="space-y-2 p-4 text-xs text-gray-500">
            <p>
              Filter via URL params: <code className="rounded bg-gray-100 px-1 py-0.5">status</code>{' '}
              (repeatable: open,triage,resolved_refund,resolved_release,resolved_split,rejected),{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">ageBucket</code>{' '}
              (lt24, lt72, gt72). Default view: open + triage, oldest first.
              Multi-select UI arrives in phase 10.
            </p>
            <ActiveFilterChips status={status} ageBucket={ageBucket} />
          </CardContent>
        </Card>

        <div className="space-y-2">
          <div className="hidden grid-cols-12 gap-3 px-4 text-xs font-medium uppercase tracking-wide text-gray-400 sm:grid">
            <div className="col-span-2">Dispute</div>
            <div className="col-span-2">Order</div>
            <div className="col-span-2">Buyer</div>
            <div className="col-span-2">Seller</div>
            <div className="col-span-2">Reason</div>
            <div className="col-span-2 text-right">Age</div>
          </div>

          {rows.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-gray-500">
                No disputes match these filters.
              </CardContent>
            </Card>
          ) : (
            rows.map((d) => <DisputeRow key={d.id} row={d} />)
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Showing {rows.length} of {total.toLocaleString()}
          </span>
          {nextCursor ? (
            <Link
              href={withCursor(nextCursor)}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
            >
              Load older →
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ActiveFilterChips({
  status,
  ageBucket,
}: {
  status: DisputeStatus[]
  ageBucket?: DisputeAgeBucket
}) {
  const chips: Array<{ key: string; label: string; cls: string }> = []
  for (const s of status) {
    chips.push({ key: `s-${s}`, label: `status: ${s}`, cls: 'bg-blue-50 text-blue-700' })
  }
  if (ageBucket) {
    chips.push({
      key: `a-${ageBucket}`,
      label: `age: ${ageBucket}`,
      cls: 'bg-amber-50 text-amber-700',
    })
  }
  if (chips.length === 0) {
    return (
      <p className="text-xs text-gray-400">
        Default filter: status in (open, triage), oldest first.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-1.5 pt-1 text-xs">
      {chips.map((c) => (
        <span key={c.key} className={`rounded-full px-2 py-0.5 ${c.cls}`}>
          {c.label}
        </span>
      ))}
    </div>
  )
}
