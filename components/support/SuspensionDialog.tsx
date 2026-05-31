'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
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
import type { ProfileStatus } from '@/lib/types'

interface SuspensionDialogProps {
  profileId: string
  status: ProfileStatus
  // 'support' cannot act on support/admin — the parent gates the trigger
  disabled?: boolean
}

const MIN_REASON = 12

export function SuspensionDialog({ profileId, status, disabled }: SuspensionDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const intent: 'suspend' | 'reactivate' = status === 'suspended' ? 'reactivate' : 'suspend'
  const title = intent === 'suspend' ? 'Suspend this user' : 'Reactivate this user'
  const description =
    intent === 'suspend'
      ? 'Suspending blocks the user from signing in. Record why.'
      : 'Reactivating restores access. Record why.'
  const buttonLabel = intent === 'suspend' ? 'Suspend user' : 'Reactivate user'
  const variant = intent === 'suspend' ? 'destructive' : 'default'

  function submit() {
    const trimmed = reason.trim()
    if (trimmed.length < MIN_REASON) {
      toast.error(`Reason must be at least ${MIN_REASON} characters`)
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/support/users/${profileId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: intent, reason: trimmed }),
        })
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          toast.error(body.error ?? `Failed to ${intent} user`)
          return
        }
        toast.success(
          intent === 'suspend'
            ? `User suspended. Reason: ${trimmed.slice(0, 60)}${trimmed.length > 60 ? '…' : ''}`
            : 'User reactivated'
        )
        setOpen(false)
        setReason('')
        router.refresh()
      } catch (error) {
        console.error('[SuspensionDialog] failed', error)
        toast.error('Network error — try again')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={intent === 'suspend' ? 'destructive' : 'outline'}
          size="sm"
          disabled={disabled}
        >
          {intent === 'suspend' ? (
            <ShieldAlert className="mr-2 h-4 w-4" />
          ) : (
            <ShieldCheck className="mr-2 h-4 w-4" />
          )}
          {intent === 'suspend' ? 'Suspend' : 'Reactivate'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="suspension-reason">Reason (visible in audit log)</Label>
          <Textarea
            id="suspension-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Repeated abusive messages confirmed in conversation #1234"
            rows={4}
            minLength={MIN_REASON}
          />
          <p className="text-xs text-gray-500">{reason.trim().length}/{MIN_REASON} min</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={isPending || reason.trim().length < MIN_REASON}
            variant={variant === 'destructive' ? 'destructive' : 'default'}
          >
            {isPending ? 'Working…' : buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
