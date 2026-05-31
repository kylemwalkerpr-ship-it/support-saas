'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CircleDollarSign } from 'lucide-react'
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
import { SUPPORT_REFUND_CAP_CENTS } from '@/lib/constants'
import type { Role } from '@/lib/types'

interface RefundDialogProps {
  orderId: string
  // total_amount stored as DOLLARS in the portal `orders` table.
  orderTotalDollars: number | null
  gateway: string | null
  viewerRole: Role
}

type RefundMode = 'full' | 'partial' | 'out_of_band'

const MIN_REASON = 20

function formatUSD(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars)
}

export function RefundDialog({
  orderId,
  orderTotalDollars,
  gateway,
  viewerRole,
}: RefundDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<RefundMode>('full')
  const [partialDollars, setPartialDollars] = useState<string>('')
  const [reason, setReason] = useState('')
  const [oobMethod, setOobMethod] = useState('')
  const [oobReference, setOobReference] = useState('')
  const [isPending, startTransition] = useTransition()

  const totalCents = orderTotalDollars != null ? Math.round(orderTotalDollars * 100) : 0
  const partialDollarsNumber = Number(partialDollars)
  const partialValid =
    Number.isFinite(partialDollarsNumber) &&
    partialDollarsNumber > 0 &&
    partialDollarsNumber <= (orderTotalDollars ?? 0)

  const amountCents = useMemo(() => {
    if (mode === 'full') return totalCents
    if (mode === 'partial' && partialValid) {
      return Math.round(partialDollarsNumber * 100)
    }
    if (mode === 'out_of_band' && partialValid) {
      return Math.round(partialDollarsNumber * 100)
    }
    return 0
  }, [mode, totalCents, partialValid, partialDollarsNumber])

  const overCap = viewerRole !== 'admin' && amountCents > SUPPORT_REFUND_CAP_CENTS
  const oobValid =
    mode !== 'out_of_band' ||
    (oobMethod.trim().length > 0 && oobReference.trim().length > 0)
  const reasonValid = reason.trim().length >= MIN_REASON
  const canSubmit =
    !isPending &&
    !overCap &&
    reasonValid &&
    oobValid &&
    amountCents > 0 &&
    amountCents <= totalCents

  function submit() {
    if (!canSubmit) return
    const body: Record<string, unknown> = {
      amountCents,
      reason: reason.trim(),
    }
    if (mode === 'out_of_band') {
      body.outOfBand = { method: oobMethod.trim(), reference: oobReference.trim() }
    } else if (gateway) {
      body.gateway = gateway
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/support/orders/${orderId}/refund`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          code?: string
        }
        if (!res.ok) {
          if (json.code === 'requires_admin_co_sign') {
            toast.error('Refund requires admin co-sign — escalate via Phase 4 dispute flow.')
          } else if (json.code === 'config_missing') {
            toast.error('Refund gateway not configured — try out-of-band.')
          } else {
            toast.error(json.error ?? 'Refund failed')
          }
          return
        }
        toast.success(`Refund of ${formatUSD(amountCents / 100)} recorded`)
        setOpen(false)
        setReason('')
        setPartialDollars('')
        setOobMethod('')
        setOobReference('')
        router.refresh()
      } catch (err) {
        console.error('[RefundDialog] failed', err)
        toast.error('Network error — try again')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CircleDollarSign className="mr-2 h-4 w-4" />
          Refund
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund order</DialogTitle>
          <DialogDescription>
            Order total: {orderTotalDollars != null ? formatUSD(orderTotalDollars) : '—'} ·
            gateway: {gateway ?? 'unknown'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Refund type</Label>
            <div className="space-y-1.5 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="refund-mode"
                  checked={mode === 'full'}
                  onChange={() => setMode('full')}
                />
                <span>
                  Full refund
                  {orderTotalDollars != null ? ` — ${formatUSD(orderTotalDollars)}` : ''}
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="refund-mode"
                  checked={mode === 'partial'}
                  onChange={() => setMode('partial')}
                />
                <span>Partial refund (gateway)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="refund-mode"
                  checked={mode === 'out_of_band'}
                  onChange={() => setMode('out_of_band')}
                />
                <span>Out-of-band (no gateway call)</span>
              </label>
            </div>
          </div>

          {(mode === 'partial' || mode === 'out_of_band') && (
            <div className="space-y-2">
              <Label htmlFor="refund-amount">Amount (USD)</Label>
              <Input
                id="refund-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                max={orderTotalDollars ?? undefined}
                value={partialDollars}
                onChange={(e) => setPartialDollars(e.target.value)}
                placeholder={orderTotalDollars != null ? `Up to ${formatUSD(orderTotalDollars)}` : ''}
              />
            </div>
          )}

          {mode === 'out_of_band' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="oob-method">Method</Label>
                <Input
                  id="oob-method"
                  value={oobMethod}
                  onChange={(e) => setOobMethod(e.target.value)}
                  placeholder="e.g. ach, paypal, wire"
                  maxLength={32}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="oob-reference">External reference</Label>
                <Input
                  id="oob-reference"
                  value={oobReference}
                  onChange={(e) => setOobReference(e.target.value)}
                  placeholder="reference id or note"
                  maxLength={120}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="refund-reason">Reason (≥ {MIN_REASON} chars)</Label>
            <Textarea
              id="refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this refund is being issued"
              rows={3}
            />
            <p className="text-xs text-gray-500">{reason.trim().length}/{MIN_REASON} min</p>
          </div>

          {overCap && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Requires admin co-sign. Support cap is{' '}
              {formatUSD(SUPPORT_REFUND_CAP_CENTS / 100)}; this refund is{' '}
              {formatUSD(amountCents / 100)}. Escalate via the dispute flow (Phase 4).
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {isPending ? 'Processing…' : `Refund ${amountCents > 0 ? formatUSD(amountCents / 100) : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
