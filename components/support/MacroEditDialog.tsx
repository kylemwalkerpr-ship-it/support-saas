'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { SupportMacro, Role } from '@/lib/types'

interface MacroEditDialogProps {
  macro?: SupportMacro | null
  trigger: React.ReactNode
  viewerRole: Role
}

export function MacroEditDialog({ macro, trigger, viewerRole }: MacroEditDialogProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState(macro?.title ?? '')
  const [body, setBody] = React.useState(macro?.body ?? '')
  const [tags, setTags] = React.useState((macro?.tags ?? []).join(', '))
  const [language, setLanguage] = React.useState(macro?.language ?? 'en')
  const [isTeamWide, setIsTeamWide] = React.useState(
    macro ? macro.owner_id === null : false
  )
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setTitle(macro?.title ?? '')
    setBody(macro?.body ?? '')
    setTags((macro?.tags ?? []).join(', '))
    setLanguage(macro?.language ?? 'en')
    setIsTeamWide(macro ? macro.owner_id === null : false)
  }, [open, macro])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) {
      toast.error('Title and body are required')
      return
    }
    setSubmitting(true)
    try {
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const payload = {
        title: title.trim(),
        body: body.trim(),
        tags: tagList,
        language: language.trim() || 'en',
        ...(macro ? {} : { isTeamWide }),
      }
      const res = await fetch(
        macro ? `/api/support/macros/${macro.id}` : '/api/support/macros',
        {
          method: macro ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(error || 'Failed')
      }
      toast.success(macro ? 'Macro updated' : 'Macro created')
      setOpen(false)
      router.refresh()
    } catch (err) {
      console.error('[macros] save failed', err)
      toast.error((err as Error).message || 'Could not save macro')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{macro ? 'Edit macro' : 'New macro'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="macro-title">Title</Label>
            <Input
              id="macro-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Refund issued"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="macro-body">Body</Label>
            <Textarea
              id="macro-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Hi {{customer.first_name}}, your refund of order {{order.order_number}} has been issued. — {{agent.name}}"
            />
            <p className="text-xs text-gray-500">
              Supported tokens: <code>{'{{customer.first_name}}'}</code>, <code>{'{{customer.full_name}}'}</code>, <code>{'{{customer.email}}'}</code>, <code>{'{{order.id}}'}</code>, <code>{'{{order.order_number}}'}</code>, <code>{'{{agent.name}}'}</code>, <code>{'{{agent.email}}'}</code>. Unknown tokens are preserved.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="macro-tags">Tags (comma-separated)</Label>
              <Input
                id="macro-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="refund, billing"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="macro-language">Language</Label>
              <Input
                id="macro-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="en"
              />
            </div>
          </div>
          {!macro && viewerRole === 'admin' && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isTeamWide}
                onChange={(e) => setIsTeamWide(e.target.checked)}
              />
              Share with the whole team
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : macro ? 'Save changes' : 'Create macro'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
