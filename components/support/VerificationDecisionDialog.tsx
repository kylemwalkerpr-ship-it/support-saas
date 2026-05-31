'use client'

import { useState, useTransition } from 'react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type {
  VerificationAction,
  VerificationType,
} from '@/lib/actions/support-verifications'

interface VerificationDecisionDialogProps {
  verificationId: string
  verificationType: VerificationType
  applicantName: string | null
  action: VerificationAction | null
  onOpenChange: (open: boolean) => void
}

const MIN_NOTES = 12

function titleFor(action: VerificationAction): string {
  switch (action) {
    case 'approve':
      return 'Approve verification'
    case 'request_changes':
      return 'Request changes'
    case 'reject':
      return 'Reject verification'
  }
}

function descriptionFor(
  action: VerificationAction,
  type: VerificationType,
  name: string | null
): string {
  const who = name ?? 'the applicant'
  switch (action) {
    case 'approve':
      if (type === 'attorney') {
        return `This will activate ${who}'s attorney account and create their attorneys row.`
      }
      if (type === 'consultant') {
        return `This will activate ${who}'s consultant profile so it appears in the marketplace.`
      }
      return `This will mark ${who} as approved.`
    case 'request_changes':
      return `Ask ${who} to update their submission. The application remains pending.`
    case 'reject':
      return `Decline ${who}'s submission. They will be marked declined.`
  }
}

function ctaFor(action: VerificationAction): string {
  switch (action) {
    case 'approve':
      return 'Approve'
    case 'request_changes':
      return 'Request changes'
    case 'reject':
      return 'Reject'
  }
}

export function VerificationDecisionDialog({
  verificationId,
  verificationType,
  applicantName,
  action,
  onOpenChange,
}: VerificationDecisionDialogProps) {
  const router = useRouter()
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  const open = action !== null
  const notesTrimmed = notes.trim()
  const notesValid = notesTrimmed.length >= MIN_NOTES
  const canSubmit = !isPending && notesValid && action !== null

  function reset() {
    setNotes('')
  }

  function submit() {
    if (!canSubmit || action === null) return
    startTransition(async () => {
      try {
        const res = await fetch(`/api/support/verifications/${verificationId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            type: verificationType,
            notes: notesTrimmed,
          }),
        })
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          status?: string
        }
        if (!res.ok) {
          toast.error(json.error ?? 'Decision failed')
          return
        }
        toast.success(
          action === 'approve'
            ? 'Verification approved'
            : action === 'reject'
              ? 'Verification rejected'
              : 'Changes requested'
        )
        onOpenChange(false)
        reset()
        router.refresh()
      } catch (err) {
        console.error('[VerificationDecisionDialog] failed', err)
        toast.error('Network error — try again')
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action ? titleFor(action) : ''}</DialogTitle>
          <DialogDescription>
            {action ? descriptionFor(action, verificationType, applicantName) : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="vd-notes">
              Decision notes (≥ {MIN_NOTES} chars)
            </Label>
            <Textarea
              id="vd-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Document the reasoning for this decision."
              rows={4}
            />
            <p className="text-xs text-gray-500">
              {notesTrimmed.length}/{MIN_NOTES} min
            </p>
          </div>

          {action === 'approve' && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {verificationType === 'attorney'
                ? `This will activate ${applicantName ?? 'the applicant'}'s role and make them visible in attorney search.`
                : verificationType === 'consultant'
                  ? `This will activate ${applicantName ?? 'the applicant'} in the consultant marketplace.`
                  : `This will activate ${applicantName ?? 'the applicant'}'s account.`}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!canSubmit}
            variant={action === 'reject' ? 'destructive' : 'default'}
          >
            {isPending ? 'Submitting…' : action ? ctaFor(action) : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
