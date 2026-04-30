import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { Header } from '@/components/dashboard/header'
import { OrderStatusBadge } from '@/components/dashboard/order-status-badge'
import { EmptyState } from '@/components/dashboard/empty-state'
import { getConsultantOrders } from '@/lib/actions/orders'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default async function ConsultantMyOrdersPage() {
  const orders = await getConsultantOrders()

  const active = orders.filter((o) => ['claimed', 'processing'].includes(o.status))
  const submitted = orders.filter((o) => o.status === 'submitted')
  const completed = orders.filter((o) => ['approved', 'delivered'].includes(o.status))

  function OrderRow({ order }: { order: (typeof orders)[0] }) {
    return (
      <div className="flex items-center justify-between py-3 border-b last:border-0 border-gray-50">
        <div>
          <p className="text-sm font-medium text-gray-900">{order.order_number}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {order.client?.full_name ?? 'Client'} · {formatDate(order.updated_at)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <OrderStatusBadge status={order.status} />
          <span className="text-sm font-semibold text-gray-900">
            {formatCurrency(order.total_amount)}
          </span>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/consultant/my-orders/${order.id}`}>View</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Header title="My Work" subtitle="Orders you've claimed and completed" />

      <div className="p-6">
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">
              Active ({active.length})
            </TabsTrigger>
            <TabsTrigger value="submitted">
              Submitted ({submitted.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({completed.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <Card>
              <CardContent className="pt-4">
                {active.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="No active orders"
                    description="Claim orders from the available queue."
                    action={{ label: 'Browse Available', href: '/consultant/available' }}
                  />
                ) : (
                  active.map((o) => <OrderRow key={o.id} order={o} />)
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="submitted">
            <Card>
              <CardContent className="pt-4">
                {submitted.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="No submitted orders"
                    description="Orders you've submitted for client review will appear here."
                  />
                ) : (
                  submitted.map((o) => <OrderRow key={o.id} order={o} />)
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="completed">
            <Card>
              <CardContent className="pt-4">
                {completed.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="No completed orders yet"
                    description="Completed and approved orders will appear here."
                  />
                ) : (
                  completed.map((o) => <OrderRow key={o.id} order={o} />)
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
