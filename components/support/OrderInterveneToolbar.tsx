'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  MessageSquare,
  CalendarClock,
  Ban,
} from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RefundDialog } from './RefundDialog'
import { OpenDisputeDialog } from './OpenDisputeDialog'
import type { Role } from '@/lib/types'

interface OrderInterveneToolbarProps {
  orderId: string
  orderTotalDollars: number | null
  gateway: string | null
  buyerId: string | null
  sellerId: string | null
  buyerLabel?: string | null
  sellerLabel?: string | null
  status: string | null
  viewerRole: Role
}

const MESSAGE_MIN = 2
const REASON_MIN = 8

export function OrderInterveneToolbar(props: OrderInterveneToolbarProps) {
  const {
    orderId,
    orderTotalDollars,
    gateway,
    buyerId,
    sellerId,
    buyerLabel,
    sellerLabel,
    status,
    viewerRole,
  } = props

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Intervene</h2>
      <p className="text-xs text-gray-500">
        Every action below is logged to the audit trail.
      </p>
      <div className="flex flex-wrap gap-2 pt-2">
        <SendMessageDialog
          orderId={orderId}
          buyerId={buyerId}
          sellerId={sellerId}
          buyerLabel={buyerLabel}
          sellerLabel={sellerLabel}
        />
        <ExtendDeadlineDialog orderId={orderId} />
        <ForceCancelDialog orderId={orderId} status={status} />
        <RefundDialog
          orderId={orderId}
          orderTotalDollars={orderTotalDollars}
          gateway={gateway}
          viewerRole={viewerRole}
        />
        <OpenDisputeDialog
          orderId={orderId}
          buyerId={buyerId}
          sellerId={sellerId}
          buyerLabel={buyerLabel}
          sellerLabel={sellerLabel}
        />
      </div>
    </div>
  )
}

// ============================================================
// Inline dialog: send message
// ============================================================
function SendMessageDialog({
  orderId,
  buyerId,
  sellerId,
  buyerLabel,
  sellerLabel,
}: {
  orderId: string
  buyerId: string | null
  sellerId: string | null
  buyerLabel?: string | null
  sellerLabel?: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState<'buyer' | 'seller' | 'both'>('buyer')
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()

  const canSubmit = !isPending && body.trim().length >= MESSAGE_MIN

  function submit() {
    if (!canSubmit) return
    startTransition(async () => {
      try {
        const res = await fetch(`/api/support/orders/${orderId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, body: body.trim() }),
        })
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          toast.error(json.error ?? 'Failed to send message')
          return
        }
        toast.success('Message sent')
        setOpen(false)
        setBody('')
        router.refresh()
      } catch (err) {
        console.error('[SendMessage] failed', err)
        toast.error('Network error — try again')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <MessageSquare className="mr-2 h-4 w-4" />
          Send message
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send order message</DialogTitle>
          <DialogDescription>
            Posts as a system message tagged "YouSafe Support" in the relevant
            conversation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Recipient</Label>
            <div className="space-y-1 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="msg-to"
                  checked={to === 'buyer'}
                  onChange={() => setTo('buyer')}
                  disabled={!buyerId}
                />
                <span>Buyer {buyerLabel ? `— ${buyerLabel}` : ''}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="msg-to"
                  checked={to === 'seller'}
                  onChange={() => setTo('seller')}
                  disabled={!sellerId}
                />
                <span>Seller {sellerLabel ? `— ${sellerLabel}` : ''}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="msg-to"
                  checked={to === 'both'}
                  onChange={() => setTo('both')}
                  disabled={!buyerId || !sellerId}
                />
                <span>Both parties</span>
              </label>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="msg-body">Message</Label>
            <Textarea
              id="msg-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the system message…"
              rows={4}
              maxLength={4000}
            />
            <p className="text-xs text-gray-500">{body.trim().length}/4000</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {isPending ? 'Sending…' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Inline dialog: extend deadline
// ============================================================
function ExtendDeadlineDialog({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState<string>('24')
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const hoursNumber = Number(hours)
  const canSubmit =
    !isPending &&
    Number.isFinite(hoursNumber) &&
    hoursNumber > 0 &&
    hoursNumber <= 720 &&
    reason.trim().length >= REASON_MIN

  function submit() {
    if (!canSubmit) return
    startTransition(async () => {
      try {
        const res = await fetch(`/api/support/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'extend_deadline',
            hours: Math.floor(hoursNumber),
            reason: reason.trim(),
          }),
        })
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          toast.error(json.error ?? 'Failed to extend deadline')
          return
        }
        toast.success(`Deadline extended by ${Math.floor(hoursNumber)}h`)
        setOpen(false)
        setReason('')
        router.refresh()
      } catch (err) {
        console.error('[ExtendDeadline] failed', err)
        toast.error('Network error — try again')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarClock className="mr-2 h-4 w-4" />
          Extend deadline
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend delivery deadline</DialogTitle>
          <DialogDescription>
            Pushes the order&apos;s `delivery_deadline` forward by N hours.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="extend-hours">Hours</Label>
            <Input
              id="extend-hours"
              type="number"
              inputMode="numeric"
              min={1}
              max={720}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="extend-reason">Reason (≥ {REASON_MIN} chars)</Label>
            <Textarea
              id="extend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Buyer agreed via chat 1234"
            />
            <p className="text-xs text-gray-500">{reason.trim().length}/{REASON_MIN} min</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {isPending ? 'Saving…' : 'Extend'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Inline dialog: force cancel
// ============================================================
function ForceCancelDialog({
  orderId,
  status,
}: {
  orderId: string
  status: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const disabled = status === 'cancelled' || status === 'refunded'
  const canSubmit = !isPending && !disabled && reason.trim().length >= REASON_MIN

  function submit() {
    if (!canSubmit) return
    startTransition(async () => {
      try {
        const res = await fetch(`/api/support/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'force_cancel',
            reason: reason.trim(),
          }),
        })
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          toast.error(json.error ?? 'Failed to cancel order')
          return
        }
        toast.success('Order force-cancelled')
        setOpen(false)
        setReason('')
        router.refresh()
      } catch (err) {
        console.error('[ForceCancel] failed', err)
        toast.error('Network error — try again')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={disabled}>
          <Ban className="mr-2 h-4 w-4" />
          Force-cancel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Force-cancel order</DialogTitle>
          <DialogDescription>
            Cancels the order and notifies both parties. This does NOT issue a
            refund — use the Refund dialog for that.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Reason (≥ {REASON_MIN} chars)</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Buyer unresponsive >7d; seller agrees to cancel"
            />
            <p className="text-xs text-gray-500">{reason.trim().length}/{REASON_MIN} min</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!canSubmit}>
            {isPending ? 'Cancelling…' : 'Force-cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
