'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Gift } from 'lucide-react'
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
import { SUPPORT_WALLET_CREDIT_CAP_CENTS } from '@/lib/constants'
import type { Role } from '@/lib/types'

interface IssueCreditDialogProps {
  profileId: string
  viewerRole: Role
}

const MEMO_MIN = 8
const REASON_MIN = 12

const PRESETS: Array<{ label: string; cents: number }> = [
  { label: '$5', cents: 500 },
  { label: '$10', cents: 1000 },
  { label: '$25', cents: 2500 },
  { label: '$50', cents: 5000 },
]

function formatUSD(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

export function IssueCreditDialog({ profileId, viewerRole }: IssueCreditDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<number | 'custom'>(2500)
  const [customDollars, setCustomDollars] = useState<string>('')
  const [memo, setMemo] = useState('')
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const amountCents = useMemo(() => {
    if (preset === 'custom') {
      const n = Number(customDollars)
      if (!Number.isFinite(n) || n <= 0) return 0
      return Math.round(n * 100)
    }
    return preset
  }, [preset, customDollars])

  const overCap =
    viewerRole !== 'admin' && amountCents > SUPPORT_WALLET_CREDIT_CAP_CENTS
  const memoValid = memo.trim().length >= MEMO_MIN
  const reasonValid = reason.trim().length >= REASON_MIN
  const canSubmit =
    !isPending && !overCap && amountCents > 0 && memoValid && reasonValid

  function reset() {
    setPreset(2500)
    setCustomDollars('')
    setMemo('')
    setReason('')
  }

  function submit() {
    if (!canSubmit) return
    startTransition(async () => {
      try {
        const res = await fetch(`/api/support/users/${profileId}/wallet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountCents,
            memo: memo.trim(),
            reason: reason.trim(),
          }),
        })
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          code?: string
        }
        if (!res.ok) {
          if (json.code === 'requires_admin_co_sign') {
            toast.error(
              `Credits above ${formatUSD(SUPPORT_WALLET_CREDIT_CAP_CENTS)} require an admin.`
            )
          } else if (json.code === 'config_missing') {
            toast.error('Wallet credit gateway not configured — escalate to admin.')
          } else {
            toast.error(json.error ?? 'Failed to issue credit')
          }
          return
        }
        toast.success(`Issued ${formatUSD(amountCents)} credit`)
        setOpen(false)
        reset()
        router.refresh()
      } catch (err) {
        console.error('[IssueCreditDialog] failed', err)
        toast.error('Network error — try again')
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Gift className="mr-2 h-4 w-4" />
          Issue credit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue wallet credit</DialogTitle>
          <DialogDescription>
            Adds funds to the user&apos;s wallet (gift / apology). Visible to the
            user as a wallet transaction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Amount</Label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.cents}
                  type="button"
                  onClick={() => {
                    setPreset(p.cents)
                    setCustomDollars('')
                  }}
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    preset === p.cents
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPreset('custom')}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  preset === 'custom'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Custom
              </button>
            </div>
            {preset === 'custom' && (
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                placeholder="Amount in USD"
                value={customDollars}
                onChange={(e) => setCustomDollars(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="credit-memo">
              Memo (visible to user, ≥ {MEMO_MIN} chars)
            </Label>
            <Textarea
              id="credit-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              placeholder="e.g. Apology credit for delayed escrow release"
              maxLength={280}
            />
            <p className="text-xs text-gray-500">
              {memo.trim().length}/{MEMO_MIN} min
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="credit-reason">
              Internal reason (≥ {REASON_MIN} chars)
            </Label>
            <Textarea
              id="credit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is support issuing this credit? Audit-visible."
            />
            <p className="text-xs text-gray-500">
              {reason.trim().length}/{REASON_MIN} min
            </p>
          </div>

          {overCap && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Requires admin. Support cap is{' '}
              {formatUSD(SUPPORT_WALLET_CREDIT_CAP_CENTS)}; this credit is{' '}
              {formatUSD(amountCents)}.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {isPending
              ? 'Issuing…'
              : `Issue ${amountCents > 0 ? formatUSD(amountCents) : 'credit'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
