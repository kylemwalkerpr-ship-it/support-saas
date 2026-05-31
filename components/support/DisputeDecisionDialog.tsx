'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SUPPORT_REFUND_CAP_CENTS } from '@/lib/constants'
import type { Role } from '@/lib/types'

export type DecisionKind =
  | 'refund_full'
  | 'refund_partial'
  | 'release'
  | 'split'
  | 'reject'

interface DisputeDecisionDialogProps {
  disputeId: string
  orderTotalDollars: number | null
  decision: DecisionKind
  open: boolean
  onOpenChange: (open: boolean) => void
  viewerRole: Role
}

const MIN_NOTES = 20

function formatUSD(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars)
}

function titleFor(decision: DecisionKind): string {
  switch (decision) {
    case 'refund_full':
      return 'Refund buyer fully'
    case 'refund_partial':
      return 'Refund partially'
    case 'release':
      return 'Release escrow to seller'
    case 'split':
      return 'Split: refund + release'
    case 'reject':
      return 'Reject dispute'
  }
}

function descriptionFor(decision: DecisionKind): string {
  switch (decision) {
    case 'refund_full':
      return 'Refunds the full order total to the buyer. Closes the dispute.'
    case 'refund_partial':
      return 'Refunds a portion to the buyer. Closes the dispute.'
    case 'release':
      return 'Releases the held escrow to the seller. Closes the dispute.'
    case 'split':
      return 'Refund a portion to the buyer AND release the remainder to the seller.'
    case 'reject':
      return 'No money movement. Marks the dispute rejected. Notify both parties of the outcome via the notes.'
  }
}

export function DisputeDecisionDialog({
  disputeId,
  orderTotalDollars,
  decision,
  open,
  onOpenChange,
  viewerRole,
}: DisputeDecisionDialogProps) {
  const router = useRouter()
  const [refundDollars, setRefundDollars] = useState('')
  const [releaseDollars, setReleaseDollars] = useState('')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  const totalCents = orderTotalDollars != null ? Math.round(orderTotalDollars * 100) : 0
  const refundDollarsNum = Number(refundDollars)
  const releaseDollarsNum = Number(releaseDollars)
  const refundValid =
    Number.isFinite(refundDollarsNum) &&
    refundDollarsNum > 0 &&
    refundDollarsNum <= (orderTotalDollars ?? 0)
  const releaseValid =
    Number.isFinite(releaseDollarsNum) &&
    releaseDollarsNum > 0 &&
    releaseDollarsNum <= (orderTotalDollars ?? 0)

  const refundCents = useMemo(() => {
    if (decision === 'refund_full') return totalCents
    if (decision === 'refund_partial' && refundValid) return Math.round(refundDollarsNum * 100)
    if (decision === 'split' && refundValid) return Math.round(refundDollarsNum * 100)
    return 0
  }, [decision, totalCents, refundValid, refundDollarsNum])

  const releaseCents = useMemo(() => {
    if (decision === 'release') return totalCents
    if (decision === 'split' && releaseValid) return Math.round(releaseDollarsNum * 100)
    return 0
  }, [decision, totalCents, releaseValid, releaseDollarsNum])

  const splitOverflow =
    decision === 'split' && refundCents + releaseCents > totalCents
  const overCap =
    viewerRole === 'support' &&
    (decision === 'refund_full' || decision === 'refund_partial' || decision === 'split') &&
    refundCents > SUPPORT_REFUND_CAP_CENTS

  const notesValid = notes.trim().length >= MIN_NOTES

  let amountsValid = true
  if (decision === 'refund_partial') amountsValid = refundValid
  else if (decision === 'release') amountsValid = totalCents > 0
  else if (decision === 'split') amountsValid = refundValid && releaseValid && !splitOverflow
  else if (decision === 'refund_full') amountsValid = totalCents > 0

  const canSubmit = !isPending && notesValid && amountsValid

  function submit() {
    if (!canSubmit) return
    const body: Record<string, unknown> = {
      action: 'decide',
      decision,
      notes: notes.trim(),
    }
    if (decision === 'refund_partial') body.amountCents = refundCents
    if (decision === 'refund_full') body.amountCents = refundCents
    if (decision === 'release') body.amountCents = releaseCents
    if (decision === 'split') {
      body.amountCents = refundCents
      body.releaseCents = releaseCents
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/support/disputes/${disputeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          code?: string
          status?: string
        }
        if (res.status === 202 || json.status === 'awaiting_co_sign') {
          toast.message('Decision recorded — awaiting admin co-sign.')
          onOpenChange(false)
          reset()
          router.refresh()
          return
        }
        if (!res.ok) {
          if (json.code === 'requires_admin_co_sign') {
            toast.error('Refund requires admin co-sign — submit again to escalate.')
          } else {
            toast.error(json.error ?? 'Decision failed')
          }
          return
        }
        toast.success('Dispute resolved')
        onOpenChange(false)
        reset()
        router.refresh()
      } catch (err) {
        console.error('[DisputeDecisionDialog] failed', err)
        toast.error('Network error — try again')
      }
    })
  }

  function reset() {
    setRefundDollars('')
    setReleaseDollars('')
    setNotes('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titleFor(decision)}</DialogTitle>
          <DialogDescription>{descriptionFor(decision)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Order total:{' '}
            <strong>{orderTotalDollars != null ? formatUSD(orderTotalDollars) : '—'}</strong>
          </div>

          {decision === 'refund_partial' && (
            <div className="space-y-1.5">
              <Label htmlFor="dd-refund">Refund amount (USD)</Label>
              <Input
                id="dd-refund"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                max={orderTotalDollars ?? undefined}
                value={refundDollars}
                onChange={(e) => setRefundDollars(e.target.value)}
                placeholder={orderTotalDollars != null ? `Up to ${formatUSD(orderTotalDollars)}` : ''}
              />
            </div>
          )}

          {decision === 'split' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dd-split-refund">Refund (USD)</Label>
                <Input
                  id="dd-split-refund"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={refundDollars}
                  onChange={(e) => setRefundDollars(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dd-split-release">Release (USD)</Label>
                <Input
                  id="dd-split-release"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={releaseDollars}
                  onChange={(e) => setReleaseDollars(e.target.value)}
                />
              </div>
              <p className="col-span-2 text-[11px] text-gray-500">
                Refund + release combined must not exceed the order total.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="dd-notes">Resolution notes (≥ {MIN_NOTES} chars)</Label>
            <Textarea
              id="dd-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Document the reasoning and outcome of this decision"
              rows={4}
            />
            <p className="text-xs text-gray-500">
              {notes.trim().length}/{MIN_NOTES} min
            </p>
          </div>

          {splitOverflow && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Refund + release exceed the order total. Adjust amounts.
            </div>
          )}

          {overCap && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This refund of {formatUSD(refundCents / 100)} exceeds the support cap of{' '}
              {formatUSD(SUPPORT_REFUND_CAP_CENTS / 100)} — submitting will request admin co-sign.
              No money moves until an admin approves.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {isPending ? 'Submitting…' : 'Submit decision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
