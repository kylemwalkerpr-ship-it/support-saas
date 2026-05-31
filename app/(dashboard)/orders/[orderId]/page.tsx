import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { getOrderBundle } from '@/lib/actions/support-orders'
import { SupportActionError } from '@/lib/errors'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OrderInterveneToolbar } from '@/components/support/OrderInterveneToolbar'
import { formatDate, formatRelativeDate } from '@/lib/utils'

type Params = Promise<{ orderId: string }>

function formatUSD(dollars: number | null): string {
  if (dollars == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars)
}

export default async function OrderDetailPage({ params }: { params: Params }) {
  const viewer = await getOrCreateProfile()
  if (!viewer || !['support', 'admin'].includes(viewer.role)) {
    redirect('/sign-in')
  }

  const { orderId } = await params

  let bundle
  try {
    bundle = await getOrderBundle(orderId)
  } catch (err) {
    if (err instanceof SupportActionError && err.code === 'not_found') {
      notFound()
    }
    throw err
  }

  const { order, buyer, seller, events, dispute } = bundle

  const buyerLabel = buyer?.full_name ?? buyer?.email ?? null
  const sellerLabel = seller?.full_name ?? seller?.email ?? null

  return (
    <div>
      <Header
        title={`Order ${order.order_number ?? order.id.slice(0, 8)}`}
        subtitle={order.id}
      />

      <div className="space-y-4 p-6">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-4 w-4" /> Back to orders
        </Link>

        {dispute ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Open dispute: {dispute.reason.slice(0, 160)}
            {dispute.reason.length > 160 ? '…' : ''} — status {dispute.status}.
            Triage UI ships in Phase 4.
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <Field label="Status" value={order.status ?? '—'} />
                <Field label="Amount" value={formatUSD(order.total_amount)} />
                <Field label="Gateway" value={order.gateway ?? '—'} />
                <Field label="Created" value={formatDate(order.created_at)} />
                <Field
                  label="Deadline"
                  value={order.delivery_deadline ? formatDate(order.delivery_deadline) : '—'}
                />
                <Field
                  label="Last updated"
                  value={
                    order.updated_at
                      ? formatRelativeDate(order.updated_at)
                      : formatRelativeDate(order.created_at)
                  }
                />
                <Field
                  label="Buyer"
                  value={
                    buyer ? (
                      <Link
                        href={`/users/${buyer.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {buyerLabel ?? '—'}
                      </Link>
                    ) : (
                      '—'
                    )
                  }
                />
                <Field
                  label="Seller"
                  value={
                    seller ? (
                      <Link
                        href={`/users/${seller.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {sellerLabel ?? '—'}
                      </Link>
                    ) : (
                      '—'
                    )
                  }
                />
                <Field label="Gig" value={order.service_title ?? '—'} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No event rows found in <code>order_events</code>. Falling back
                    to a status-only view: order is{' '}
                    <strong>{order.status ?? 'pending'}</strong> since{' '}
                    {formatRelativeDate(order.updated_at ?? order.created_at)}.
                  </p>
                ) : (
                  <ol className="space-y-3 border-l border-gray-200 pl-4">
                    {events.map((evt) => (
                      <li key={evt.id} className="relative text-sm">
                        <span className="absolute -left-[18px] top-1.5 h-2.5 w-2.5 rounded-full bg-blue-500" />
                        <p className="text-xs text-gray-400">
                          {formatDate(evt.created_at)} · {evt.actor_role ?? 'system'}
                        </p>
                        <p className="text-gray-700">
                          <span className="font-medium">{evt.to_status}</span>
                          {evt.from_status ? (
                            <span className="text-gray-400"> (from {evt.from_status})</span>
                          ) : null}
                        </p>
                        {evt.note ? (
                          <p className="text-xs text-gray-500">{evt.note}</p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <OrderInterveneToolbar
              orderId={order.id}
              orderTotalDollars={order.total_amount}
              gateway={order.gateway}
              buyerId={order.client_id}
              sellerId={order.consultant_id}
              buyerLabel={buyerLabel}
              sellerLabel={sellerLabel}
              status={order.status}
              viewerRole={viewer.role}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <div className="text-sm text-gray-800">{value}</div>
    </div>
  )
}
