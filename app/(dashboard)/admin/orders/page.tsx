import { ClipboardList } from 'lucide-react'
import { Header } from '@/components/dashboard/header'
import { OrderStatusBadge } from '@/components/dashboard/order-status-badge'
import { EmptyState } from '@/components/dashboard/empty-state'
import { getAllOrders } from '@/lib/actions/orders'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminOrderActions } from './admin-order-actions'

export default async function AdminOrdersPage() {
  const orders = await getAllOrders()
  const active = orders.filter((o) => o.status !== 'cart')

  return (
    <div>
      <Header title="All Orders" subtitle="Monitor and manage every order on the platform" />

      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Orders ({active.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {active.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No orders yet"
                description="Orders will appear here once clients start placing them."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-3 text-left font-medium text-gray-500">Order</th>
                      <th className="pb-3 text-left font-medium text-gray-500">Client</th>
                      <th className="pb-3 text-left font-medium text-gray-500">Consultant</th>
                      <th className="pb-3 text-left font-medium text-gray-500">Date</th>
                      <th className="pb-3 text-left font-medium text-gray-500">Status</th>
                      <th className="pb-3 text-right font-medium text-gray-500">Amount</th>
                      <th className="pb-3 text-right font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {active.map((order) => (
                      <tr key={order.id}>
                        <td className="py-3 font-mono text-xs font-medium text-gray-900">
                          {order.order_number}
                        </td>
                        <td className="py-3 text-gray-700">
                          <div>
                            <p className="font-medium">{order.client?.full_name ?? '—'}</p>
                            <p className="text-xs text-gray-400">{order.client?.email}</p>
                          </div>
                        </td>
                        <td className="py-3 text-gray-700">
                          {order.consultant ? (
                            <div>
                              <p className="font-medium">{order.consultant.full_name ?? '—'}</p>
                              <p className="text-xs text-gray-400">{order.consultant.email}</p>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">Unassigned</span>
                          )}
                        </td>
                        <td className="py-3 text-gray-500">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="py-3">
                          <OrderStatusBadge status={order.status} />
                        </td>
                        <td className="py-3 text-right font-semibold text-gray-900">
                          {formatCurrency(order.total_amount)}
                        </td>
                        <td className="py-3 text-right">
                          <AdminOrderActions orderId={order.id} currentStatus={order.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
