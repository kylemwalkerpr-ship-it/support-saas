'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { StickyNote } from 'lucide-react'
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

interface AddNoteDialogProps {
  profileId: string
  triggerLabel?: string
}

const MIN_BODY = 4

export function AddNoteDialog({
  profileId,
  triggerLabel = 'Add note',
}: AddNoteDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()

  function submit() {
    const trimmed = body.trim()
    if (trimmed.length < MIN_BODY) {
      toast.error(`Note must be at least ${MIN_BODY} characters`)
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/support/users/${profileId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add_note', body: trimmed }),
        })
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          toast.error(payload.error ?? 'Failed to add note')
          return
        }
        toast.success('Note added')
        setOpen(false)
        setBody('')
        router.refresh()
      } catch (error) {
        console.error('[AddNoteDialog] failed', error)
        toast.error('Network error — try again')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <StickyNote className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Internal note</DialogTitle>
          <DialogDescription>
            Visible to other agents only. Append-only — notes cannot be edited.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="note-body">Note</Label>
          <Textarea
            id="note-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="e.g. Customer called in re: refund timeline. Promised follow-up by EOD."
            minLength={MIN_BODY}
          />
          <p className="text-xs text-gray-500">{body.trim().length}/{MIN_BODY} min</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending || body.trim().length < MIN_BODY}>
            {isPending ? 'Saving…' : 'Save note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
