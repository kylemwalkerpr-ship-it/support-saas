'use client'

import { useState, useTransition } from 'react'
import { Trash2, Loader2, ShoppingCart, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { removeCartItem, placeOrder } from '@/lib/actions/orders'
import { formatCurrency } from '@/lib/utils'
import type { Order } from '@/lib/types'

export function CartPanel({ cart }: { cart: Order }) {
  const router = useRouter()
  const [requirements, setRequirements] = useState('')
  const [isPlacing, startPlacing] = useTransition()
  const [isRemoving, startRemoving] = useTransition()

  function handleRemove(itemId: string) {
    startRemoving(async () => {
      await removeCartItem(itemId)
      toast.success('Item removed')
      router.refresh()
    })
  }

  function handlePlace() {
    if (!requirements.trim()) {
      toast.error('Please describe your requirements')
      return
    }
    startPlacing(async () => {
      await placeOrder(cart.id, requirements)
      toast.success('Order placed! It\'s now in the queue.')
      router.refresh()
    })
  }

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-900">
          <ShoppingCart className="h-5 w-5" />
          Your Cart ({cart.items?.length ?? 0} item
          {(cart.items?.length ?? 0) !== 1 ? 's' : ''})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Items */}
        <div className="space-y-2">
          {cart.items?.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg bg-white px-4 py-3 border border-blue-100"
            >
              <div>
                <p className="font-medium text-gray-900 text-sm">
                  {item.service?.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Qty {item.quantity} × {formatCurrency(item.unit_price)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-900 text-sm">
                  {formatCurrency(item.subtotal)}
                </span>
                <button
                  onClick={() => handleRemove(item.id)}
                  disabled={isRemoving}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between rounded-lg bg-white px-4 py-3 border border-blue-100 font-semibold">
          <span className="text-gray-700">Total</span>
          <span className="text-gray-900 text-lg">{formatCurrency(cart.total_amount)}</span>
        </div>

        {/* Requirements */}
        <div className="space-y-1.5">
          <Label htmlFor="requirements">Project Requirements</Label>
          <Textarea
            id="requirements"
            placeholder="Describe what you need, your goals, any specific requirements, deadlines, or context that will help the consultant..."
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            className="min-h-[100px] bg-white"
          />
        </div>

        {/* Place order */}
        <Button
          onClick={handlePlace}
          disabled={isPlacing || !requirements.trim()}
          className="w-full h-11"
        >
          {isPlacing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Place Order <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
