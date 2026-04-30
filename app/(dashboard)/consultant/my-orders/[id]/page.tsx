import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { getOrderById, getOrderHistory } from '@/lib/actions/orders'
import { Header } from '@/components/dashboard/header'
import { OrderStatusBadge } from '@/components/dashboard/order-status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate, getInitials } from '@/lib/utils'
import { ConsultantActions } from './consultant-actions'

export default async function ConsultantOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [order, history] = await Promise.all([
    getOrderById(id),
    getOrderHistory(id),
  ])

  if (!order) notFound()

  return (
    <div>
      <Header title={order.order_number} subtitle="Order details" />

      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/consultant/my-orders">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
          <OrderStatusBadge status={order.status} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {/* Services */}
            <Card>
              <CardHeader><CardTitle>Scope of Work</CardTitle></CardHeader>
              <CardContent>
                <div className="divide-y divide-gray-100">
                  {order.items?.map((item) => (
                    <div key={item.id} className="flex items-start justify-between py-3">
                      <div>
                        <p className="font-medium text-gray-900">{item.service?.title}</p>
                        <p className="text-sm text-gray-500">{item.service?.description}</p>
                      </div>
                      <span className="font-semibold text-gray-900 shrink-0 ml-4">
                        {formatCurrency(item.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between pt-4 border-t font-semibold text-gray-900">
                  <span>Total Value</span>
                  <span>{formatCurrency(order.total_amount)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Client requirements */}
            {order.requirements && (
              <Card>
                <CardHeader><CardTitle>Client Requirements</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                    {order.requirements}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <ConsultantActions order={order} />

            {/* Timeline */}
            <Card>
              <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {history.map((entry, idx) => (
                    <div key={entry.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-2.5 w-2.5 rounded-full bg-blue-600 mt-1 shrink-0" />
                        {idx < history.length - 1 && (
                          <div className="flex-1 w-px bg-gray-200 mt-1" />
                        )}
                      </div>
                      <div className="pb-4">
                        <p className="text-sm font-medium text-gray-900">
                          {entry.from_status
                            ? `${entry.from_status} → ${entry.to_status}`
                            : entry.to_status}
                        </p>
                        {entry.note && (
                          <p className="text-xs text-gray-500 mt-0.5">{entry.note}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDate(entry.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Order Info</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Order #</span>
                  <span className="font-medium">{order.order_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Placed</span>
                  <span className="font-medium">{formatDate(order.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Value</span>
                  <span className="font-medium font-semibold">{formatCurrency(order.total_amount)}</span>
                </div>
              </CardContent>
            </Card>

            {order.client && (
              <Card>
                <CardHeader><CardTitle>Client</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold text-sm">
                      {getInitials(order.client.full_name)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {order.client.full_name ?? 'Client'}
                      </p>
                      <p className="text-xs text-gray-500">{order.client.email}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
