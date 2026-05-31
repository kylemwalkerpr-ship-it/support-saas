import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { searchOrders } from '@/lib/actions/support-orders'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent } from '@/components/ui/card'
import { OrderRow } from '@/components/support/OrderRow'

function asStringArray(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : value.split(',')
}

function parseNumeric(value: string | undefined): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

type SearchParams = Promise<{
  status?: string | string[]
  gateway?: string | string[]
  amountMin?: string
  amountMax?: string
  dateFrom?: string
  dateTo?: string
  hasOpenDispute?: string
  cursor?: string
}>

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const profile = await getOrCreateProfile()
  if (!profile || !['support', 'admin'].includes(profile.role)) {
    redirect('/sign-in')
  }

  const sp = await searchParams
  const status = asStringArray(sp.status).map((s) => s.trim()).filter(Boolean)
  const gateway = asStringArray(sp.gateway).map((s) => s.trim()).filter(Boolean)
  const amountMin = parseNumeric(sp.amountMin)
  const amountMax = parseNumeric(sp.amountMax)
  const dateFrom = typeof sp.dateFrom === 'string' ? sp.dateFrom : undefined
  const dateTo = typeof sp.dateTo === 'string' ? sp.dateTo : undefined
  const hasOpenDispute = sp.hasOpenDispute === '1' || sp.hasOpenDispute === 'true'
  const cursor = typeof sp.cursor === 'string' ? sp.cursor : null

  const { orders, nextCursor, total } = await searchOrders({
    status: status.length ? status : undefined,
    gateway: gateway.length ? gateway : undefined,
    amountMin,
    amountMax,
    dateFrom,
    dateTo,
    hasOpenDispute: hasOpenDispute || undefined,
    cursor: cursor ?? undefined,
    limit: 50,
  })

  // Hydrate buyer/seller labels for the page rows in a single query batch.
  const partyIds = Array.from(
    new Set(
      orders.flatMap((o) => [o.client_id, o.consultant_id].filter((x): x is string => !!x))
    )
  )
  const partyLabels = await loadPartyLabels(partyIds)

  const baseSp = new URLSearchParams()
  for (const v of status) baseSp.append('status', v)
  for (const v of gateway) baseSp.append('gateway', v)
  if (amountMin != null) baseSp.set('amountMin', String(amountMin))
  if (amountMax != null) baseSp.set('amountMax', String(amountMax))
  if (dateFrom) baseSp.set('dateFrom', dateFrom)
  if (dateTo) baseSp.set('dateTo', dateTo)
  if (hasOpenDispute) baseSp.set('hasOpenDispute', '1')

  function withCursor(c: string | null): string {
    const out = new URLSearchParams(baseSp.toString())
    if (c) out.set('cursor', c)
    const qs = out.toString()
    return qs ? `/orders?${qs}` : '/orders'
  }

  return (
    <div>
      <Header
        title="Orders"
        subtitle={`${total.toLocaleString()} total · showing ${orders.length}`}
      />

      <div className="space-y-4 p-6">
        <Card>
          <CardContent className="space-y-2 p-4 text-xs text-gray-500">
            <p>
              Filter via URL params: <code className="rounded bg-gray-100 px-1 py-0.5">status</code>,{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">gateway</code>,{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">amountMin</code>,{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">amountMax</code>,{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">dateFrom</code>,{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">dateTo</code>,{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">hasOpenDispute</code>.
              Multi-select UI arrives in phase 10.
            </p>
            <ActiveFilterChips
              status={status}
              gateway={gateway}
              amountMin={amountMin}
              amountMax={amountMax}
              dateFrom={dateFrom}
              dateTo={dateTo}
              hasOpenDispute={hasOpenDispute}
            />
          </CardContent>
        </Card>

        <div className="space-y-2">
          <div className="hidden grid-cols-12 gap-3 px-4 text-xs font-medium uppercase tracking-wide text-gray-400 sm:grid">
            <div className="col-span-2">Order</div>
            <div className="col-span-2">Buyer</div>
            <div className="col-span-2">Seller</div>
            <div className="col-span-2">Gig</div>
            <div className="col-span-1 text-right">Amount</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1">Gateway</div>
            <div className="col-span-1">Created</div>
          </div>

          {orders.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-gray-500">
                No orders match these filters.
              </CardContent>
            </Card>
          ) : (
            orders.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                buyerLabel={o.client_id ? partyLabels.get(o.client_id) ?? null : null}
                sellerLabel={
                  o.consultant_id ? partyLabels.get(o.consultant_id) ?? null : null
                }
              />
            ))
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Showing {orders.length} of {total.toLocaleString()}
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

async function loadPartyLabels(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from('profiles')
    .select('id, full_name, email')
    .in('id', ids)
  for (const row of (data ?? []) as Array<{
    id: string
    full_name: string | null
    email: string
  }>) {
    out.set(row.id, row.full_name ?? row.email)
  }
  return out
}

function ActiveFilterChips({
  status,
  gateway,
  amountMin,
  amountMax,
  dateFrom,
  dateTo,
  hasOpenDispute,
}: {
  status: string[]
  gateway: string[]
  amountMin?: number
  amountMax?: number
  dateFrom?: string
  dateTo?: string
  hasOpenDispute: boolean
}) {
  const chips: Array<{ key: string; label: string; cls: string }> = []
  for (const s of status) chips.push({ key: `s-${s}`, label: `status: ${s}`, cls: 'bg-blue-50 text-blue-700' })
  for (const g of gateway) chips.push({ key: `g-${g}`, label: `gateway: ${g}`, cls: 'bg-purple-50 text-purple-700' })
  if (amountMin != null) chips.push({ key: 'amin', label: `≥ $${amountMin}`, cls: 'bg-emerald-50 text-emerald-700' })
  if (amountMax != null) chips.push({ key: 'amax', label: `≤ $${amountMax}`, cls: 'bg-emerald-50 text-emerald-700' })
  if (dateFrom) chips.push({ key: 'df', label: `from ${dateFrom}`, cls: 'bg-amber-50 text-amber-700' })
  if (dateTo) chips.push({ key: 'dt', label: `to ${dateTo}`, cls: 'bg-amber-50 text-amber-700' })
  if (hasOpenDispute) chips.push({ key: 'd', label: 'open dispute', cls: 'bg-rose-50 text-rose-700' })

  if (chips.length === 0) {
    return <p className="text-xs text-gray-400">No filters active — showing most recent orders.</p>
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

