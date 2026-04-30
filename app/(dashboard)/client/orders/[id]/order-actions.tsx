'use client'

import { useTransition } from 'react'
import { Loader2, CheckCircle, Package } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { approveOrder, markDelivered } from '@/lib/actions/orders'
import type { OrderStatus } from '@/lib/types'

export function OrderActions({
  orderId,
  status,
}: {
  orderId: string
  status: OrderStatus
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (status === 'submitted') {
    return (
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => {
            startTransition(async () => {
              await approveOrder(orderId)
              toast.success('Work approved!')
              router.refresh()
            })
          }}
          disabled={isPending}
          className="bg-green-600 hover:bg-green-700"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <><CheckCircle className="h-4 w-4 mr-2" /> Approve Work</>
          )}
        </Button>
      </div>
    )
  }

  if (status === 'approved') {
    return (
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => {
            startTransition(async () => {
              await markDelivered(orderId)
              toast.success('Order marked as delivered!')
              router.refresh()
            })
          }}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <><Package className="h-4 w-4 mr-2" /> Mark as Delivered</>
          )}
        </Button>
      </div>
    )
  }

  return null
}
