'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, MessageSquareText } from 'lucide-react'
import { toast } from 'sonner'
import type { SupportMacro } from '@/lib/types'

interface MacroInsertButtonProps {
  onInsert: (rendered: { id: string; body: string; title: string }) => void
  disabled?: boolean
}

export function MacroInsertButton({ onInsert, disabled }: MacroInsertButtonProps) {
  const [open, setOpen] = React.useState(false)
  const [macros, setMacros] = React.useState<SupportMacro[]>([])
  const [loading, setLoading] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', onDocClick)
      return () => document.removeEventListener('mousedown', onDocClick)
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/support/macros?scope=all${search ? `&search=${encodeURIComponent(search)}` : ''}`)
      .then((r) => r.json())
      .then((j: { macros?: SupportMacro[] }) => {
        if (cancelled) return
        setMacros(j.macros ?? [])
      })
      .catch((err) => {
        console.error('[macros] list failed', err)
        toast.error('Could not load macros')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, search])

  async function insert(macroId: string, title: string) {
    try {
      const res = await fetch(`/api/support/macros/${macroId}`)
      if (!res.ok) throw new Error('Failed to load macro')
      const json = (await res.json()) as { macro?: SupportMacro }
      if (!json.macro) throw new Error('Macro missing')
      onInsert({ id: json.macro.id, body: json.macro.body, title })
      setOpen(false)
    } catch (err) {
      console.error('[macros] insert failed', err)
      toast.error('Could not insert macro')
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
        Insert macro
        <ChevronDown className="ml-1 h-3 w-3" />
      </Button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-80 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search macros…"
            autoFocus
          />
          <div className="mt-2 max-h-64 overflow-y-auto">
            {loading ? (
              <p className="px-2 py-3 text-xs text-gray-500">Loading…</p>
            ) : macros.length === 0 ? (
              <p className="px-2 py-3 text-xs text-gray-500">No macros found.</p>
            ) : (
              macros.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => insert(m.id, m.title)}
                  className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <p className="font-medium text-gray-900">{m.title}</p>
                  <p className="truncate text-xs text-gray-500">{m.body.slice(0, 120)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
