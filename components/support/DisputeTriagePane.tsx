import Link from 'next/link'
import { formatDate, formatRelativeDate } from '@/lib/utils'
import type { DisputeTriageBundle } from '@/lib/actions/support-disputes'

interface DisputeTriagePaneProps {
  bundle: DisputeTriageBundle
}

function formatUSD(dollars: number | null): string {
  if (dollars == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars)
}

function shortId(id: string): string {
  return id.slice(0, 8)
}

function ProfileChip({
  label,
  email,
  role,
  href,
}: {
  label: string | null
  email: string | null
  role: string
  href: string | null
}) {
  const initial = (label ?? email ?? '?').slice(0, 1).toUpperCase()
  const body = (
    <div className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
        {initial}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-gray-900">{label ?? email ?? '—'}</p>
        <p className="text-[10px] text-gray-500">{role}</p>
      </div>
    </div>
  )
  return href ? (
    <Link href={href} className="block hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  )
}

function MiniOrderRow({
  orderId,
  orderNumber,
  status,
  totalAmount,
  createdAt,
}: {
  orderId: string
  orderNumber: string | null
  status: string | null
  totalAmount: number | null
  createdAt: string
}) {
  return (
    <Link
      href={`/orders/${orderId}`}
      className="flex items-center justify-between rounded-md border border-gray-100 bg-white px-2.5 py-2 text-xs hover:bg-gray-50"
    >
      <div className="min-w-0">
        <p className="truncate font-mono text-[11px] text-gray-700">
          {orderNumber ?? shortId(orderId)}
        </p>
        <p className="text-[10px] text-gray-400">
          {status ?? '—'} · {formatRelativeDate(createdAt)}
        </p>
      </div>
      <span className="text-xs font-medium text-gray-800">{formatUSD(totalAmount)}</span>
    </Link>
  )
}

export function DisputeTriagePane({ bundle }: DisputeTriagePaneProps) {
  const { dispute, order, buyer, seller, buyerHistory, sellerHistory } = bundle
  const buyerLabel = buyer?.full_name ?? buyer?.email ?? null
  const sellerLabel = seller?.full_name ?? seller?.email ?? null
  const proposed =
    dispute.metadata && typeof dispute.metadata === 'object'
      ? (dispute.metadata as Record<string, unknown>)
      : {}
  const hasProposal = typeof proposed.proposed_decision === 'string'

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* LEFT — buyer */}
      <div className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Buyer (client)
        </p>
        <ProfileChip
          label={buyerLabel}
          email={buyer?.email ?? null}
          role="client"
          href={buyer ? `/users/${buyer.id}` : null}
        />

        <div className="rounded-md border border-gray-100 bg-white p-3 text-xs">
          <p className="text-[10px] uppercase tracking-wide text-gray-400">
            Opening message
          </p>
          <p className="mt-1 whitespace-pre-wrap text-gray-700">{dispute.reason}</p>
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            History with this seller (last 5)
          </p>
          <div className="space-y-1.5">
            {buyerHistory.length === 0 ? (
              <p className="text-[11px] text-gray-400">No prior orders with this seller.</p>
            ) : (
              buyerHistory.map((h) => (
                <MiniOrderRow
                  key={h.id}
                  orderId={h.id}
                  orderNumber={h.order_number}
                  status={h.status}
                  totalAmount={h.total_amount}
                  createdAt={h.created_at}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* CENTER — order */}
      <div className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Order
        </p>
        <div className="rounded-md border border-gray-100 bg-white p-3">
          <div className="flex items-center justify-between">
            <Link
              href={`/orders/${order.id}`}
              className="font-mono text-xs font-medium text-blue-700 hover:underline"
            >
              {order.order_number ?? shortId(order.id)}
            </Link>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
              {order.status ?? '—'}
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {formatUSD(order.total_amount)}
          </p>
          <p className="text-[11px] text-gray-500">
            via {order.gateway ?? '—'} · created {formatDate(order.created_at)}
          </p>

          {order.delivery_deadline && (
            <p className="mt-2 text-[11px] text-gray-500">
              Deadline {formatDate(order.delivery_deadline)}
            </p>
          )}
          {order.cancelled_at && (
            <p className="mt-1 text-[11px] text-rose-600">
              Cancelled {formatRelativeDate(order.cancelled_at)}
            </p>
          )}
          {order.refunded_at && (
            <p className="mt-1 text-[11px] text-rose-600">
              Refunded {formatUSD(order.refunded_amount)} on{' '}
              {formatDate(order.refunded_at)}
            </p>
          )}
        </div>

        <div className="rounded-md border border-gray-100 bg-white p-3 text-xs">
          <p className="text-[10px] uppercase tracking-wide text-gray-400">
            Dispute meta
          </p>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <dt className="text-gray-500">Opened</dt>
            <dd className="text-gray-800">{formatRelativeDate(dispute.created_at)}</dd>
            <dt className="text-gray-500">Status</dt>
            <dd className="text-gray-800">{dispute.status}</dd>
            <dt className="text-gray-500">Against</dt>
            <dd className="text-gray-800">{dispute.against_role}</dd>
          </dl>
        </div>

        {hasProposal && (
          <div className="rounded-md border border-purple-200 bg-purple-50 p-3 text-xs">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-700">
              Awaiting co-sign
            </p>
            <p className="mt-1 text-purple-900">
              Proposed: <strong>{String(proposed.proposed_decision)}</strong>
              {typeof proposed.proposed_amount_cents === 'number'
                ? ` — refund ${formatUSD(Number(proposed.proposed_amount_cents) / 100)}`
                : ''}
              {typeof proposed.proposed_release_cents === 'number'
                ? ` · release ${formatUSD(Number(proposed.proposed_release_cents) / 100)}`
                : ''}
            </p>
            {typeof proposed.proposed_notes === 'string' && (
              <p className="mt-1 italic text-purple-800">“{String(proposed.proposed_notes)}”</p>
            )}
          </div>
        )}
      </div>

      {/* RIGHT — seller */}
      <div className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Seller (consultant)
        </p>
        <ProfileChip
          label={sellerLabel}
          email={seller?.email ?? null}
          role="consultant"
          href={seller ? `/users/${seller.id}` : null}
        />

        <div className="rounded-md border border-gray-100 bg-white p-3 text-xs">
          <p className="text-[10px] uppercase tracking-wide text-gray-400">
            Seller response
          </p>
          <p className="mt-1 text-gray-500">
            {dispute.resolution_notes ?? 'No response captured yet.'}
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            History with other buyers (last 5)
          </p>
          <div className="space-y-1.5">
            {sellerHistory.length === 0 ? (
              <p className="text-[11px] text-gray-400">No other recent orders.</p>
            ) : (
              sellerHistory.map((h) => (
                <MiniOrderRow
                  key={h.id}
                  orderId={h.id}
                  orderNumber={h.order_number}
                  status={h.status}
                  totalAmount={h.total_amount}
                  createdAt={h.created_at}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
