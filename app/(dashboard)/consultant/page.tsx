import Link from 'next/link'
import { Briefcase, ClipboardList, CheckCircle, TrendingUp } from 'lucide-react'
import { Header } from '@/components/dashboard/header'
import { StatCard } from '@/components/dashboard/stat-card'
import { OrderStatusBadge } from '@/components/dashboard/order-status-badge'
import { EmptyState } from '@/components/dashboard/empty-state'
import { getConsultantOrders, getAvailableOrders } from '@/lib/actions/orders'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { formatCurrency, formatRelativeDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default async function ConsultantOverviewPage() {
  const [profile, myOrders, available] = await Promise.all([
    getOrCreateProfile(),
    getConsultantOrders(),
    getAvailableOrders(),
  ])

  const active = myOrders.filter((o) =>
    ['claimed', 'processing'].includes(o.status)
  )
  const submitted = myOrders.filter((o) => o.status === 'submitted')
  const delivered = myOrders.filter((o) => o.status === 'delivered')
  const totalEarned = delivered.reduce((s, o) => s + o.total_amount, 0)
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div>
      <Header
        title={`Welcome back, ${firstName}`}
        subtitle="Manage your active projects and claim new work"
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Available to Claim"
            value={available.length}
            icon={Briefcase}
            iconColor="text-yellow-600"
            iconBg="bg-yellow-50"
          />
          <StatCard
            title="Active Work"
            value={active.length}
            icon={ClipboardList}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
          />
          <StatCard
            title="Submitted"
            value={submitted.length}
            icon={TrendingUp}
            iconColor="text-purple-600"
            iconBg="bg-purple-50"
          />
          <StatCard
            title="Total Earned"
            value={formatCurrency(totalEarned)}
            icon={CheckCircle}
            iconColor="text-green-600"
            iconBg="bg-green-50"
          />
        </div>

        {/* Available orders alert */}
        {available.length > 0 && (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-yellow-800">
                {available.length} new order{available.length > 1 ? 's' : ''} available
              </p>
              <p className="text-sm text-yellow-600 mt-0.5">
                Claim orders before other consultants pick them up.
              </p>
            </div>
            <Button asChild size="sm" className="bg-yellow-600 hover:bg-yellow-700 shrink-0">
              <Link href="/consultant/available">View Orders</Link>
            </Button>
          </div>
        )}

        {/* Active work */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My Active Work</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/consultant/my-orders">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {active.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="No active orders"
                description="Claim available orders to start working."
                action={{ label: 'Browse Available', href: '/consultant/available' }}
              />
            ) : (
              <div className="divide-y divide-gray-100">
                {active.map((order) => (
                  <Link
                    key={order.id}
                    href={`/consultant/my-orders/${order.id}`}
                    className="flex items-center justify-between py-3 hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-gray-900">
                        {order.order_number}
                      </p>
                      <p className="text-xs text-gray-500">
                        {order.client?.full_name ?? 'Client'} ·{' '}
                        {formatRelativeDate(order.updated_at)}
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
      </div>
    </div>
  )
}
