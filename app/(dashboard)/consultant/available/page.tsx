import { Briefcase } from 'lucide-react'
import { redirect } from 'next/navigation'
import { Header } from '@/components/dashboard/header'
import { EmptyState } from '@/components/dashboard/empty-state'
import { OrderStatusBadge } from '@/components/dashboard/order-status-badge'
import { getAvailableOrders } from '@/lib/actions/orders'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { formatCurrency, formatDate, getInitials } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClaimOrderButton } from './claim-order-button'

export default async function AvailableOrdersPage() {
  const profile = await getOrCreateProfile()
  if (profile?.role !== 'consultant') redirect('/dashboard')

  const orders = await getAvailableOrders()

  return (
    <div>
      <Header
        title="Available Orders"
        subtitle="Claim orders to start working on them"
      />

      <div className="p-6 space-y-4">
        {orders.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <EmptyState
                icon={Briefcase}
                title="No available orders"
                description="Check back soon — new orders will appear here as clients submit them."
              />
            </CardContent>
          </Card>
        ) : (
          orders.map((order) => (
            <Card key={order.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-900">
                        {order.order_number}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </div>

                    {/* Services */}
                    <div className="flex flex-wrap gap-2">
                      {order.items?.map((item) => (
                        <span
                          key={item.id}
                          className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                        >
                          {item.service?.title}
                        </span>
                      ))}
                    </div>

                    {/* Requirements preview */}
                    {order.requirements && (
                      <p className="text-sm text-gray-500 line-clamp-2">
                        {order.requirements}
                      </p>
                    )}

                    {/* Client + meta */}
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      {order.client && (
                        <div className="flex items-center gap-1.5">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-gray-600 font-medium text-xs">
                            {getInitials(order.client.full_name)}
                          </div>
                          {order.client.full_name ?? 'Client'}
                        </div>
                      )}
                      <span>Placed {formatDate(order.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-3 shrink-0">
                    <span className="text-2xl font-bold text-gray-900">
                      {formatCurrency(order.total_amount)}
                    </span>
                    <ClaimOrderButton orderId={order.id} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
