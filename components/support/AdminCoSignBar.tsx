'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ShieldCheck, ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface AdminCoSignBarProps {
  disputeId: string
  proposalDecision: string
  proposalAmountCents?: number
  proposalReleaseCents?: number
  proposalNotes?: string
}

function formatUSD(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

export function AdminCoSignBar({
  disputeId,
  proposalDecision,
  proposalAmountCents,
  proposalReleaseCents,
  proposalNotes,
}: AdminCoSignBarProps) {
  const router = useRouter()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  function submit(action: 'approve' | 'reject', notes?: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/support/disputes/${disputeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'cosign',
            cosignAction: action,
            notes,
          }),
        })
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
        }
        if (!res.ok) {
          toast.error(json.error ?? 'Co-sign action failed')
          return
        }
        toast.success(
          action === 'approve' ? 'Co-sign approved — decision executed.' : 'Co-sign rejected.'
        )
        setRejectOpen(false)
        setRejectNotes('')
        router.refresh()
      } catch (err) {
        console.error('[AdminCoSignBar] failed', err)
        toast.error('Network error — try again')
      }
    })
  }

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-700">
          Admin co-sign required
        </p>
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800">
          {proposalDecision}
        </span>
      </div>

      <div className="mb-3 space-y-1 rounded-md bg-white/70 px-3 py-2 text-xs text-purple-900">
        {typeof proposalAmountCents === 'number' && (
          <p>
            Refund proposed: <strong>{formatUSD(proposalAmountCents)}</strong>
          </p>
        )}
        {typeof proposalReleaseCents === 'number' && (
          <p>
            Release proposed: <strong>{formatUSD(proposalReleaseCents)}</strong>
          </p>
        )}
        {proposalNotes && (
          <p className="italic">“{proposalNotes}”</p>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => submit('approve')}
          disabled={isPending}
        >
          <ShieldCheck className="mr-2 h-4 w-4" />
          Approve & execute
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRejectOpen(true)}
          disabled={isPending}
        >
          <ShieldX className="mr-2 h-4 w-4" />
          Reject
        </Button>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject co-sign request</DialogTitle>
            <DialogDescription>
              Returns the dispute to open. The proposing agent will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-notes">Notes (optional)</Label>
            <Textarea
              id="reject-notes"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Explain why the proposal is being rejected"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={() => submit('reject', rejectNotes.trim() || undefined)} disabled={isPending}>
              {isPending ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
