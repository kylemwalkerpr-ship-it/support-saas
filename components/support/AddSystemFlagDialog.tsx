'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  ModerationCategory,
  ModerationTargetType,
} from '@/lib/types'

const TARGET_TYPES: { value: ModerationTargetType; label: string }[] = [
  { value: 'gig', label: 'Gig' },
  { value: 'message', label: 'Message' },
  { value: 'review', label: 'Review' },
  { value: 'profile', label: 'Profile' },
]

const CATEGORIES: { value: ModerationCategory; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'abuse', label: 'Abuse' },
  { value: 'scam', label: 'Scam' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'other', label: 'Other' },
]

const REASON_MIN = 12

/**
 * Admin-only entry point for creating a system flag against arbitrary content.
 * Phase 7 ships this as a minimal manual surface — automated detection lives
 * outside this brief. Visibility gating is done on the parent page.
 */
export function AddSystemFlagDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [targetType, setTargetType] = useState<ModerationTargetType>('gig')
  const [targetId, setTargetId] = useState('')
  const [category, setCategory] = useState<ModerationCategory>('spam')
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  function reset() {
    setTargetType('gig')
    setTargetId('')
    setCategory('spam')
    setReason('')
  }

  function submit() {
    const trimmed = reason.trim()
    if (trimmed.length < REASON_MIN) {
      toast.error(`Reason must be at least ${REASON_MIN} characters`)
      return
    }
    if (!targetId.trim()) {
      toast.error('Target id is required')
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/support/moderation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_type: targetType,
            target_id: targetId.trim(),
            category,
            reason: trimmed,
          }),
        })
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          toast.error(json.error ?? 'Could not create flag')
          return
        }
        toast.success('System flag created')
        reset()
        setOpen(false)
        router.refresh()
      } catch (err) {
        console.error('[AddSystemFlagDialog] submit failed', err)
        toast.error('Network error — try again')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-4 w-4" />
          New system flag
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New system flag</DialogTitle>
          <DialogDescription className="text-xs">
            Manually raise a flag against any content. For abuse triage when no
            user has reported it yet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Target type</Label>
            <Select
              value={targetType}
              onValueChange={(v) => setTargetType(v as ModerationTargetType)}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="add-flag-target-id" className="text-xs">
              Target id
            </Label>
            <Input
              id="add-flag-target-id"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="UUID or stringified id of the target row"
              disabled={isPending}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as ModerationCategory)}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="add-flag-reason" className="text-xs">
              Reason (≥ {REASON_MIN} chars)
            </Label>
            <Textarea
              id="add-flag-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this content being flagged?"
              rows={3}
              disabled={isPending}
            />
            <p className="text-[11px] text-gray-500">
              {reason.trim().length}/{REASON_MIN} min
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              reset()
              setOpen(false)
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={
              isPending ||
              !targetId.trim() ||
              reason.trim().length < REASON_MIN
            }
          >
            {isPending ? 'Working…' : 'Create flag'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
