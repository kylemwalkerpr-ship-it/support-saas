'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Mail } from 'lucide-react'
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
import type { SupportMacro } from '@/lib/types'

interface SendEmailDialogProps {
  profileId: string
  // Target user info — used to (a) render macro tokens client-side for the
  // preview and (b) display the recipient address in the UI.
  user: {
    email: string | null
    full_name: string | null
  }
  agent: {
    name: string | null
    email: string | null
  }
}

const SUBJECT_DEFAULT = 'From YouSafe Support'

// Mirrors lib/actions/support-macros.ts renderMacroBody. We render client-side
// purely to drive the preview pane; the server re-renders before sending.
const TOKEN_RE = /\{\{([a-zA-Z0-9_.]+)\}\}/g

function renderPreview(
  body: string,
  ctx: Record<string, Record<string, string | null>>
): string {
  return body.replace(TOKEN_RE, (full, path: string) => {
    const parts = path.split('.')
    let cursor: unknown = ctx
    for (const part of parts) {
      if (
        cursor &&
        typeof cursor === 'object' &&
        part in (cursor as Record<string, unknown>)
      ) {
        cursor = (cursor as Record<string, unknown>)[part]
      } else {
        return full
      }
    }
    if (cursor == null) return full
    if (typeof cursor === 'string') return cursor
    if (typeof cursor === 'number' || typeof cursor === 'boolean') return String(cursor)
    return full
  })
}

export function SendEmailDialog({ profileId, user, agent }: SendEmailDialogProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [macros, setMacros] = React.useState<SupportMacro[]>([])
  const [loadingMacros, setLoadingMacros] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [selectedMacroId, setSelectedMacroId] = React.useState<string | null>(null)
  const [subjectOverride, setSubjectOverride] = React.useState('')
  const [replyTo, setReplyTo] = React.useState('')
  const [isPending, startTransition] = React.useTransition()

  const fullName = (user.full_name ?? '').trim()
  const [firstName, ...rest] = fullName ? fullName.split(/\s+/) : ['']
  const lastName = rest.join(' ') || null

  const renderCtx = React.useMemo(
    () => ({
      customer: {
        first_name: firstName || null,
        last_name: lastName,
        full_name: fullName || null,
        email: user.email,
      },
      agent: {
        name: agent.name,
        email: agent.email,
      },
    }),
    [firstName, lastName, fullName, user.email, agent.name, agent.email]
  )

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingMacros(true)
    const qs = search ? `&search=${encodeURIComponent(search)}` : ''
    fetch(`/api/support/macros?scope=all${qs}`)
      .then((r) => r.json())
      .then((j: { macros?: SupportMacro[] }) => {
        if (cancelled) return
        const list = j.macros ?? []
        setMacros(list)
        if (list.length > 0 && !selectedMacroId) {
          setSelectedMacroId(list[0].id)
        }
      })
      .catch((err) => {
        console.error('[SendEmailDialog] list macros failed', err)
        toast.error('Could not load macros')
      })
      .finally(() => {
        if (!cancelled) setLoadingMacros(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search])

  const selectedMacro = React.useMemo(
    () => macros.find((m) => m.id === selectedMacroId) ?? null,
    [macros, selectedMacroId]
  )

  const previewBody = React.useMemo(() => {
    if (!selectedMacro) return ''
    return renderPreview(selectedMacro.body, renderCtx)
  }, [selectedMacro, renderCtx])

  const previewSubject =
    subjectOverride.trim() || selectedMacro?.title || SUBJECT_DEFAULT

  const canSubmit =
    !isPending && !!user.email && !!selectedMacro

  function reset() {
    setSubjectOverride('')
    setReplyTo('')
    setSelectedMacroId(null)
    setSearch('')
  }

  function submit() {
    if (!canSubmit || !selectedMacro) return
    startTransition(async () => {
      try {
        const body: Record<string, unknown> = { macroId: selectedMacro.id }
        if (subjectOverride.trim()) body.subject = subjectOverride.trim()
        if (replyTo.trim()) body.replyTo = replyTo.trim()
        const res = await fetch(`/api/support/users/${profileId}/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          code?: string
        }
        if (!res.ok) {
          if (json.code === 'config_missing') {
            toast.error('Email provider not configured.')
          } else {
            toast.error(json.error ?? 'Failed to send email')
          }
          return
        }
        toast.success('Email sent')
        setOpen(false)
        reset()
        router.refresh()
      } catch (err) {
        console.error('[SendEmailDialog] failed', err)
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
        <Button variant="outline" size="sm" disabled={!user.email}>
          <Mail className="mr-2 h-4 w-4" />
          Email user
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email {user.full_name ?? user.email ?? 'user'}</DialogTitle>
          <DialogDescription>
            Sends via Resend from support@yousafeconsultancy.com. A copy is
            appended to the user&apos;s Notes tab.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[260px_1fr]">
          <div className="space-y-2">
            <Label>Macros</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search macros…"
            />
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-1">
              {loadingMacros ? (
                <p className="px-2 py-3 text-xs text-gray-500">Loading…</p>
              ) : macros.length === 0 ? (
                <p className="px-2 py-3 text-xs text-gray-500">No macros found.</p>
              ) : (
                macros.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMacroId(m.id)}
                    className={`block w-full rounded-md px-2 py-2 text-left text-sm transition ${
                      selectedMacroId === m.id
                        ? 'bg-white shadow-sm ring-1 ring-blue-200'
                        : 'hover:bg-white'
                    }`}
                  >
                    <p className="font-medium text-gray-900">{m.title}</p>
                    <p className="truncate text-xs text-gray-500">
                      {m.body.slice(0, 80)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email-recipient">To</Label>
              <Input
                id="email-recipient"
                value={user.email ?? ''}
                readOnly
                className="bg-gray-50 text-gray-600"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={subjectOverride}
                onChange={(e) => setSubjectOverride(e.target.value)}
                placeholder={SUBJECT_DEFAULT}
                maxLength={200}
              />
              <p className="text-xs text-gray-500">
                Final subject: {previewSubject}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email-reply-to">Reply-to (optional)</Label>
              <Input
                id="email-reply-to"
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="support@yousafeconsultancy.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Preview</Label>
              <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-800">
                {selectedMacro ? (
                  previewBody || (
                    <span className="text-gray-400">
                      Macro body is empty.
                    </span>
                  )
                ) : (
                  <span className="text-gray-400">
                    Pick a macro to see the preview.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {isPending ? 'Sending…' : 'Send email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
