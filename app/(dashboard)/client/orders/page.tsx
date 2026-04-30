import Link from 'next/link'
import { ClipboardList, ShoppingCart } from 'lucide-react'
import { Header } from '@/components/dashboard/header'
import { OrderStatusBadge } from '@/components/dashboard/order-status-badge'
import { EmptyState } from '@/components/dashboard/empty-state'
import { getClientOrders, getOrCreateCart } from '@/lib/actions/orders'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CartPanel } from './cart-panel'

export default async function ClientOrdersPage() {
  const [orders, cart] = await Promise.all([
    getClientOrders(),
    getOrCreateCart(),
  ])

  return (
    <div>
      <Header title="My Orders" subtitle="Track and manage your consultancy orders" />

      <div className="p-6 space-y-6">
        {/* Cart */}
        {(cart.items?.length ?? 0) > 0 && (
          <CartPanel cart={cart} />
        )}

        {/* Order list */}
        <Card>
          <CardHeader>
            <CardTitle>Order History</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No orders placed yet"
                description="Your confirmed orders will appear here."
                action={{ label: 'Browse Services', href: '/client/services' }}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-3 text-left font-medium text-gray-500">Order</th>
                      <th className="pb-3 text-left font-medium text-gray-500">Services</th>
                      <th className="pb-3 text-left font-medium text-gray-500">Date</th>
                      <th className="pb-3 text-left font-medium text-gray-500">Status</th>
                      <th className="pb-3 text-right font-medium text-gray-500">Total</th>
                      <th className="pb-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {orders.map((order) => (
                      <tr key={order.id} className="group">
                        <td className="py-3 font-medium text-gray-900">
                          {order.order_number}
                        </td>
                        <td className="py-3 text-gray-600">
                          {order.items
                            ?.map((i) => i.service?.title)
                            .filter(Boolean)
                            .join(', ')
                            .slice(0, 40) ?? '—'}
                          {(order.items?.reduce((s, i) => s + (i.service?.title?.length ?? 0), 0) ?? 0) > 40 && '...'}
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
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="opacity-0 group-hover:opacity-100"
                          >
                            <Link href={`/client/orders/${order.id}`}>View</Link>
                          </Button>
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
