'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'
import { MacroInsertButton } from './MacroInsertButton'
import type { SupportMacro } from '@/lib/types'

interface MessageComposerProps {
  conversationId: string
}

interface PickedMacro {
  id: string
  title: string
}

export function MessageComposer({ conversationId }: MessageComposerProps) {
  const router = useRouter()
  const [value, setValue] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [pickedMacro, setPickedMacro] = React.useState<PickedMacro | null>(null)
  const [autocomplete, setAutocomplete] = React.useState<{
    open: boolean
    query: string
    results: SupportMacro[]
  }>({ open: false, query: '', results: [] })
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Detect "/<query>" at cursor start for slash autocomplete.
  React.useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const caret = el.selectionStart
    const prefix = value.slice(0, caret)
    const match = /(^|\s)\/([a-zA-Z0-9_-]{0,40})$/.exec(prefix)
    if (!match) {
      setAutocomplete({ open: false, query: '', results: [] })
      return
    }
    const query = match[2]
    setAutocomplete((s) => ({ ...s, open: true, query }))
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch(`/api/support/macros?scope=all&search=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((j: { macros?: SupportMacro[] }) => {
          setAutocomplete((s) => ({ ...s, results: (j.macros ?? []).slice(0, 6) }))
        })
        .catch(() => setAutocomplete((s) => ({ ...s, results: [] })))
    }, 150)
  }, [value])

  function applyAutocomplete(macro: SupportMacro) {
    const el = textareaRef.current
    if (!el) return
    const caret = el.selectionStart
    const prefix = value.slice(0, caret).replace(/(^|\s)\/[a-zA-Z0-9_-]*$/, '$1')
    const suffix = value.slice(caret)
    setValue(prefix + suffix)
    setAutocomplete({ open: false, query: '', results: [] })
    setPickedMacro({ id: macro.id, title: macro.title })
    toast.message(`Macro "${macro.title}" attached`, {
      description: 'Tokens render server-side on send',
    })
    requestAnimationFrame(() => el.focus())
  }

  function onInsert(macro: { id: string; body: string; title: string }) {
    const el = textareaRef.current
    const caret = el?.selectionStart ?? value.length
    const next = value.slice(0, caret) + macro.body + value.slice(caret)
    setValue(next)
    setPickedMacro({ id: macro.id, title: macro.title })
    // Tokens are NOT pre-rendered client-side — they'll render on send if
    // we pass macroId. But to keep WYSIWYG honest, also clear the picked
    // macro flag since the textarea now contains the literal body. The
    // macro tag below is purely a UX hint that lets the agent strip the
    // body and re-insert via the server-side render path.
    requestAnimationFrame(() => el?.focus())
  }

  async function send() {
    const trimmed = value.trim()
    if (!trimmed && !pickedMacro) {
      toast.error('Type a message before sending')
      return
    }
    setSending(true)
    try {
      const res = await fetch(`/api/support/inbox/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          body: trimmed,
          macroId: pickedMacro?.id ?? null,
        }),
      })
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(error || 'Failed to send')
      }
      setValue('')
      setPickedMacro(null)
      router.refresh()
    } catch (err) {
      console.error('[composer] send failed', err)
      toast.error((err as Error).message || 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (autocomplete.open && autocomplete.results.length > 0) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        applyAutocomplete(autocomplete.results[0])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setAutocomplete({ open: false, query: '', results: [] })
        return
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="border-t border-gray-200 bg-white p-3">
      {pickedMacro && (
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
          Macro attached: {pickedMacro.title}
          <button
            type="button"
            onClick={() => setPickedMacro(null)}
            className="rounded-full px-1 hover:bg-blue-100"
          >
            ×
          </button>
        </div>
      )}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Reply to the customer… (type / for macros, ⌘↩ to send)"
          rows={4}
          disabled={sending}
        />
        {autocomplete.open && autocomplete.results.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 w-full max-w-md rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
            {autocomplete.results.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => applyAutocomplete(m)}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-50"
              >
                <p className="font-medium text-gray-900">{m.title}</p>
                <p className="truncate text-xs text-gray-500">{m.body.slice(0, 96)}</p>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <MacroInsertButton onInsert={onInsert} disabled={sending} />
        <Button onClick={send} disabled={sending} size="sm">
          <Send className="mr-1.5 h-3.5 w-3.5" />
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </div>
  )
}
