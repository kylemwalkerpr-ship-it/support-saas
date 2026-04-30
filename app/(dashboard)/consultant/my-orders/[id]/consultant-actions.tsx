'use client'

import { useState, useTransition } from 'react'
import { Loader2, Play, Send } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { startProcessing, submitOrder } from '@/lib/actions/orders'
import type { Order } from '@/lib/types'

export function ConsultantActions({ order }: { order: Order }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [deliveryUrl, setDeliveryUrl] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')

  if (order.status === 'claimed') {
    return (
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader><CardTitle className="text-blue-900">Start Working</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            When you're ready to begin, mark this order as in progress.
          </p>
          <Button
            onClick={() => {
              startTransition(async () => {
                await startProcessing(order.id)
                toast.success("Order marked as in progress")
                router.refresh()
              })
            }}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <><Play className="h-4 w-4 mr-2" /> Start Processing</>
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (order.status === 'processing') {
    return (
      <Card className="border-purple-200 bg-purple-50/50">
        <CardHeader><CardTitle className="text-purple-900">Submit Your Work</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="delivery-url">Delivery Link</Label>
            <Input
              id="delivery-url"
              placeholder="https://drive.google.com/... or any URL"
              value={deliveryUrl}
              onChange={(e) => setDeliveryUrl(e.target.value)}
              className="bg-white"
            />
            <p className="text-xs text-gray-500">
              Link to your deliverable (Google Drive, Dropbox, Notion, etc.)
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delivery-notes">Delivery Notes</Label>
            <Textarea
              id="delivery-notes"
              placeholder="Summarize what you've delivered and any important notes for the client..."
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              className="min-h-[100px] bg-white"
            />
          </div>
          <Button
            onClick={() => {
              if (!deliveryUrl.trim()) {
                toast.error('Please provide a delivery link')
                return
              }
              startTransition(async () => {
                await submitOrder(order.id, deliveryUrl, deliveryNotes)
                toast.success('Work submitted for client review!')
                router.refresh()
              })
            }}
            disabled={isPending || !deliveryUrl.trim()}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <><Send className="h-4 w-4 mr-2" /> Submit for Review</>
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (order.status === 'submitted') {
    return (
      <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
        <p className="font-medium text-orange-800">Awaiting client review</p>
        <p className="text-sm text-orange-600 mt-1">
          The client will review your work and approve or request changes.
        </p>
      </div>
    )
  }

  if (['approved', 'delivered'].includes(order.status)) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <p className="font-medium text-green-800">Work complete</p>
        <p className="text-sm text-green-600 mt-1">
          This order has been approved and marked as complete.
        </p>
      </div>
    )
  }

  return null
}
