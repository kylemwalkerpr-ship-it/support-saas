'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserCog } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Role } from '@/lib/types'

interface RoleChangeDialogProps {
  profileId: string
  currentRole: Role
  // Caller is admin — gate at the parent.
  visible: boolean
}

const ROLES: Role[] = ['client', 'consultant', 'support', 'admin']
const MIN_REASON = 12

export function RoleChangeDialog({
  profileId,
  currentRole,
  visible,
}: RoleChangeDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [newRole, setNewRole] = useState<Role>(currentRole)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  if (!visible) return null

  function submit() {
    const trimmed = reason.trim()
    if (trimmed.length < MIN_REASON) {
      toast.error(`Reason must be at least ${MIN_REASON} characters`)
      return
    }
    if (newRole === currentRole) {
      toast.error('Pick a different role')
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/support/users/${profileId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'change_role', newRole, reason: trimmed }),
        })
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          toast.error(body.error ?? 'Failed to change role')
          return
        }
        toast.success(`Role updated to ${newRole}`)
        setOpen(false)
        setReason('')
        router.refresh()
      } catch (error) {
        console.error('[RoleChangeDialog] failed', error)
        toast.error('Network error — try again')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserCog className="mr-2 h-4 w-4" />
          Change role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change user role</DialogTitle>
          <DialogDescription>
            Admin-only. The new role takes effect immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="role-select">New role</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
              <SelectTrigger id="role-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">Current: {currentRole}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-reason">Reason</Label>
            <Textarea
              id="role-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Promoting to support after onboarding completed"
              rows={3}
              minLength={MIN_REASON}
            />
            <p className="text-xs text-gray-500">
              {reason.trim().length}/{MIN_REASON} min
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              isPending ||
              reason.trim().length < MIN_REASON ||
              newRole === currentRole
            }
          >
            {isPending ? 'Working…' : 'Apply role change'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
