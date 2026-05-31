'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Flag } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface OpenDisputeDialogProps {
  orderId: string
  buyerId: string | null
  sellerId: string | null
  buyerLabel?: string | null
  sellerLabel?: string | null
}

const MIN_REASON = 12

export function OpenDisputeDialog({
  orderId,
  buyerId,
  sellerId,
  buyerLabel,
  sellerLabel,
}: OpenDisputeDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [against, setAgainst] = useState<'buyer' | 'seller'>('seller')
  const [isPending, startTransition] = useTransition()

  const canSubmit =
    !isPending &&
    reason.trim().length >= MIN_REASON &&
    (against === 'buyer' ? !!buyerId : !!sellerId)

  function submit() {
    if (!canSubmit) return
    const againstId = against === 'buyer' ? buyerId : sellerId
    if (!againstId) {
      toast.error('Cannot open dispute: counterparty missing')
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/support/disputes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            againstId,
            againstRole: against,
            reason: reason.trim(),
          }),
        })
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          toast.error(body.error ?? 'Failed to open dispute')
          return
        }
        toast.success('Dispute opened')
        setOpen(false)
        setReason('')
        router.refresh()
      } catch (err) {
        console.error('[OpenDisputeDialog] failed', err)
        toast.error('Network error — try again')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Flag className="mr-2 h-4 w-4" />
          Open dispute
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a dispute</DialogTitle>
          <DialogDescription>
            Opens a dispute against the chosen party. Triage UI ships in Phase 4.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Party against</Label>
            <div className="space-y-1.5 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="dispute-against"
                  checked={against === 'buyer'}
                  onChange={() => setAgainst('buyer')}
                  disabled={!buyerId}
                />
                <span>Buyer {buyerLabel ? `— ${buyerLabel}` : ''}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="dispute-against"
                  checked={against === 'seller'}
                  onChange={() => setAgainst('seller')}
                  disabled={!sellerId}
                />
                <span>Seller {sellerLabel ? `— ${sellerLabel}` : ''}</span>
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dispute-reason">Reason (≥ {MIN_REASON} chars)</Label>
            <Textarea
              id="dispute-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Summarize the issue"
              rows={3}
            />
            <p className="text-xs text-gray-500">{reason.trim().length}/{MIN_REASON} min</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {isPending ? 'Opening…' : 'Open dispute'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
