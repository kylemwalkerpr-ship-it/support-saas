import { ShoppingCart, ClipboardList, CheckCircle, Clock } from 'lucide-react'
import { Header } from '@/components/dashboard/header'
import { StatCard } from '@/components/dashboard/stat-card'
import { EmptyState } from '@/components/dashboard/empty-state'
import { OrderStatusBadge } from '@/components/dashboard/order-status-badge'
import { getClientOrders } from '@/lib/actions/orders'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { formatCurrency, formatRelativeDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function ClientOverviewPage() {
  const [profile, orders] = await Promise.all([
    getOrCreateProfile(),
    getClientOrders(),
  ])

  const active = orders.filter((o) =>
    ['queued', 'claimed', 'processing'].includes(o.status)
  )
  const submitted = orders.filter((o) => o.status === 'submitted')
  const delivered = orders.filter((o) => o.status === 'delivered')
  const totalSpent = orders
    .filter((o) => o.status === 'delivered')
    .reduce((sum, o) => sum + o.total_amount, 0)

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div>
      <Header
        title={`Good day, ${firstName}`}
        subtitle="Here's what's happening with your orders"
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Active Orders"
            value={active.length}
            icon={Clock}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
          />
          <StatCard
            title="Awaiting Review"
            value={submitted.length}
            icon={ClipboardList}
            iconColor="text-orange-600"
            iconBg="bg-orange-50"
          />
          <StatCard
            title="Completed"
            value={delivered.length}
            icon={CheckCircle}
            iconColor="text-green-600"
            iconBg="bg-green-50"
          />
          <StatCard
            title="Total Spent"
            value={formatCurrency(totalSpent)}
            icon={ShoppingCart}
            iconColor="text-purple-600"
            iconBg="bg-purple-50"
          />
        </div>

        {/* Recent orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Orders</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/client/orders">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title="No orders yet"
                description="Browse our services and place your first order."
                action={{ label: 'Browse Services', href: '/client/services' }}
              />
            ) : (
              <div className="divide-y divide-gray-100">
                {orders.slice(0, 5).map((order) => (
                  <Link
                    key={order.id}
                    href={`/client/orders/${order.id}`}
                    className="flex items-center justify-between py-3 hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-gray-900">
                        {order.order_number}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatRelativeDate(order.created_at)} ·{' '}
                        {order.items?.length ?? 0} service
                        {(order.items?.length ?? 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <OrderStatusBadge status={order.status} />
                      <span className="text-sm font-semibold text-gray-900">
                        {formatCurrency(order.total_amount)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick action */}
        {submitted.length > 0 && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-orange-800">
                {submitted.length} order{submitted.length > 1 ? 's' : ''} waiting for your review
              </p>
              <p className="text-sm text-orange-600 mt-0.5">
                Review and approve submitted work to mark it as delivered.
              </p>
            </div>
            <Button asChild size="sm" className="bg-orange-600 hover:bg-orange-700 shrink-0">
              <Link href="/client/orders">Review Now</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
