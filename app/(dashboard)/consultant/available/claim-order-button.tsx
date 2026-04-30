'use client'

import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { claimOrder } from '@/lib/actions/orders'

export function ClaimOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      onClick={() => {
        startTransition(async () => {
          await claimOrder(orderId)
          toast.success('Order claimed! Head to My Work to get started.')
          router.push('/consultant/my-orders')
          router.refresh()
        })
      }}
      disabled={isPending}
    >
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Claim Order'}
    </Button>
  )
}
