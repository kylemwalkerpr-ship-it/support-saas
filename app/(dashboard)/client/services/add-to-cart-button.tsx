'use client'

import { useTransition } from 'react'
import { ShoppingCart, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { addToCart } from '@/lib/actions/orders'
import { useRouter } from 'next/navigation'

export function AddToCartButton({
  serviceId,
  isInCart,
}: {
  serviceId: string
  isInCart: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleAdd() {
    if (isInCart) return
    startTransition(async () => {
      await addToCart(serviceId)
      toast.success('Added to cart')
      router.refresh()
    })
  }

  if (isInCart) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
        <Check className="h-4 w-4" />
        In cart
      </div>
    )
  }

  return (
    <Button size="sm" onClick={handleAdd} disabled={isPending}>
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <ShoppingCart className="h-4 w-4" />
          Add to cart
        </>
      )}
    </Button>
  )
}
