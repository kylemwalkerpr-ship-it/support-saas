import Link from 'next/link'
import { ClipboardList, Users, TrendingUp, DollarSign } from 'lucide-react'
import { Header } from '@/components/dashboard/header'
import { StatCard } from '@/components/dashboard/stat-card'
import { OrderStatusBadge } from '@/components/dashboard/order-status-badge'
import { getAllOrders } from '@/lib/actions/orders'
import { getAllProfiles } from '@/lib/actions/profiles'
import { formatCurrency, formatRelativeDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default async function AdminOverviewPage() {
  const [orders, profiles] = await Promise.all([
    getAllOrders(),
    getAllProfiles(),
  ])

  const activeOrders = orders.filter((o) =>
    ['queued', 'claimed', 'processing', 'submitted'].includes(o.status)
  )
  const delivered = orders.filter((o) => o.status === 'delivered')
  const totalRevenue = delivered.reduce((s, o) => s + o.total_amount, 0)
  const clients = profiles.filter((p) => p.role === 'client')
  const consultants = profiles.filter((p) => p.role === 'consultant')

  return (
    <div>
      <Header title="Admin Overview" subtitle="Platform-wide analytics and management" />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Orders"
            value={orders.filter((o) => o.status !== 'cart').length}
            subtitle={`${activeOrders.length} active`}
            icon={ClipboardList}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
          />
          <StatCard
            title="Total Users"
            value={profiles.length}
            subtitle={`${clients.length} clients · ${consultants.length} consultants`}
            icon={Users}
            iconColor="text-purple-600"
            iconBg="bg-purple-50"
          />
          <StatCard
            title="Completed"
            value={delivered.length}
            icon={TrendingUp}
            iconColor="text-green-600"
            iconBg="bg-green-50"
          />
          <StatCard
            title="Total Revenue"
            value={formatCurrency(totalRevenue)}
            icon={DollarSign}
            iconColor="text-yellow-600"
            iconBg="bg-yellow-50"
          />
        </div>

        {/* Recent orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Orders</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/orders">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-3 text-left font-medium text-gray-500">Order</th>
                    <th className="pb-3 text-left font-medium text-gray-500">Client</th>
                    <th className="pb-3 text-left font-medium text-gray-500">Consultant</th>
                    <th className="pb-3 text-left font-medium text-gray-500">Status</th>
                    <th className="pb-3 text-right font-medium text-gray-500">Amount</th>
                    <th className="pb-3 text-right font-medium text-gray-500">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders
                    .filter((o) => o.status !== 'cart')
                    .slice(0, 10)
                    .map((order) => (
                      <tr key={order.id} className="group">
                        <td className="py-3 font-medium text-gray-900">
                          <Link
                            href={`/admin/orders`}
                            className="hover:text-blue-600 transition-colors"
                          >
                            {order.order_number}
                          </Link>
                        </td>
                        <td className="py-3 text-gray-600">
                          {order.client?.full_name ?? order.client?.email ?? '—'}
                        </td>
                        <td className="py-3 text-gray-600">
                          {order.consultant?.full_name ?? <span className="text-gray-400">Unassigned</span>}
                        </td>
                        <td className="py-3">
                          <OrderStatusBadge status={order.status} />
                        </td>
                        <td className="py-3 text-right font-semibold text-gray-900">
                          {formatCurrency(order.total_amount)}
                        </td>
                        <td className="py-3 text-right text-gray-500">
                          {formatRelativeDate(order.created_at)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* User breakdown */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Users</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/users">View all</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-gray-100">
                {profiles.slice(0, 6).map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold text-xs">
                        {(p.full_name ?? p.email).slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {p.full_name ?? 'Unnamed'}
                        </p>
                        <p className="text-xs text-gray-500">{p.email}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.role === 'admin' ? 'bg-amber-100 text-amber-700' :
                      p.role === 'consultant' ? 'bg-purple-100 text-purple-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {p.role}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Order Status Breakdown</CardTitle></CardHeader>
            <CardContent>
              {(['queued', 'claimed', 'processing', 'submitted', 'approved', 'delivered'] as const).map((status) => {
                const count = orders.filter((o) => o.status === status).length
                const pct = orders.length > 0 ? Math.round((count / orders.length) * 100) : 0
                return (
                  <div key={status} className="flex items-center gap-3 py-2">
                    <OrderStatusBadge status={status} />
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-6 text-right">{count}</span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
