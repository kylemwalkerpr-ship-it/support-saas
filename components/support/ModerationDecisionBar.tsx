'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Ban,
  CircleSlash,
  EyeOff,
  MessageSquareWarning,
  ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ModerationDecisionAction } from '@/lib/actions/support-moderation'

interface ModerationDecisionBarProps {
  flagId: string
  // The user-id field is required when warning or suspending. For gig flags
  // this is the gig seller; for messages it's the sender; for reviews it's
  // the reviewer; for profiles it's the profile itself.
  candidateUserId: string | null
  candidateUserLabel: string | null
  onDecided: () => void
}

const NOTES_MIN_HIDE = 12
const NOTES_MIN_WARN = 12
const NOTES_MIN_SUSPEND = 12

interface ActionConfig {
  key: ModerationDecisionAction
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  minNotes: number
  notesPlaceholder: string
  destructive?: boolean
  requiresUser?: boolean
  notesRequired?: boolean
}

const ACTIONS: ActionConfig[] = [
  {
    key: 'dismiss',
    label: 'Dismiss',
    icon: CircleSlash,
    description:
      'Mark this flag as not actionable. The target content stays visible.',
    minNotes: 0,
    notesPlaceholder: 'Optional reasoning for the audit log',
    notesRequired: false,
  },
  {
    key: 'hide',
    label: 'Hide',
    icon: EyeOff,
    description:
      'Hide the flagged content. Portal render paths filter is_hidden=true rows out.',
    minNotes: NOTES_MIN_HIDE,
    notesPlaceholder: 'Why hide this content? (visible in audit log)',
    notesRequired: true,
  },
  {
    key: 'warn_user',
    label: 'Warn',
    icon: MessageSquareWarning,
    description:
      'Send a system warning notification to the user. Content stays visible.',
    minNotes: NOTES_MIN_WARN,
    notesPlaceholder: 'Warning message — sent to the user verbatim',
    notesRequired: true,
    requiresUser: true,
  },
  {
    key: 'suspend_user',
    label: 'Suspend',
    icon: ShieldAlert,
    description:
      'Suspend the user. Blocks sign-in via the existing suspend flow.',
    minNotes: NOTES_MIN_SUSPEND,
    notesPlaceholder: 'Reason for suspension (visible in audit log)',
    notesRequired: true,
    requiresUser: true,
    destructive: true,
  },
]

export function ModerationDecisionBar({
  flagId,
  candidateUserId,
  candidateUserLabel,
  onDecided,
}: ModerationDecisionBarProps) {
  const router = useRouter()
  const [activeAction, setActiveAction] = useState<ModerationDecisionAction | null>(
    null
  )
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  function reset() {
    setNotes('')
    setActiveAction(null)
  }

  function selectAction(key: ModerationDecisionAction) {
    if (activeAction === key) {
      reset()
    } else {
      setActiveAction(key)
      setNotes('')
    }
  }

  const config = ACTIONS.find((a) => a.key === activeAction) ?? null

  function submit() {
    if (!config) return
    const trimmed = notes.trim()
    if (config.notesRequired && trimmed.length < config.minNotes) {
      toast.error(`Notes must be at least ${config.minNotes} characters`)
      return
    }
    if (config.requiresUser && !candidateUserId) {
      toast.error('This action needs a user reference, but the target has none.')
      return
    }

    const body: Record<string, unknown> = {
      action: config.key,
    }
    if (trimmed) body.notes = trimmed
    if (config.requiresUser && candidateUserId) body.userId = candidateUserId

    startTransition(async () => {
      try {
        const res = await fetch(`/api/support/moderation/${flagId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          toast.error(json.error ?? 'Decision failed')
          return
        }
        toast.success(`Decision recorded: ${config.label.toLowerCase()}`)
        reset()
        onDecided()
        router.refresh()
      } catch (err) {
        console.error('[ModerationDecisionBar] failed', err)
        toast.error('Network error — try again')
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ACTIONS.map((a) => {
          const Icon = a.icon
          const isActive = activeAction === a.key
          return (
            <Button
              key={a.key}
              type="button"
              variant={
                isActive
                  ? a.destructive
                    ? 'destructive'
                    : 'default'
                  : 'outline'
              }
              size="sm"
              onClick={() => selectAction(a.key)}
              disabled={isPending}
            >
              <Icon className="mr-1.5 h-4 w-4" />
              {a.label}
            </Button>
          )
        })}
      </div>

      {config ? (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs text-gray-600">{config.description}</p>

          {config.requiresUser && (
            <div className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700">
              {candidateUserId ? (
                <>
                  Will apply to:{' '}
                  <strong>{candidateUserLabel ?? candidateUserId}</strong>
                </>
              ) : (
                <span className="text-rose-700">
                  No user reference on this target — action unavailable.
                </span>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor={`mod-notes-${flagId}`} className="text-xs">
              {config.notesRequired
                ? `Notes (≥ ${config.minNotes} chars)`
                : 'Notes (optional)'}
            </Label>
            <Textarea
              id={`mod-notes-${flagId}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={config.notesPlaceholder}
              rows={3}
            />
            {config.notesRequired && (
              <p className="text-[11px] text-gray-500">
                {notes.trim().length}/{config.minNotes} min
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant={config.destructive ? 'destructive' : 'default'}
              size="sm"
              onClick={submit}
              disabled={
                isPending ||
                (config.requiresUser && !candidateUserId) ||
                (config.notesRequired && notes.trim().length < config.minNotes)
              }
            >
              {isPending ? (
                <>
                  <Ban className="mr-1.5 h-4 w-4 animate-pulse" /> Working…
                </>
              ) : (
                `Confirm ${config.label.toLowerCase()}`
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
