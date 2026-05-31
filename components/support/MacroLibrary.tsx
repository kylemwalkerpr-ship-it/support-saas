'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2 } from 'lucide-react'
import { MacroEditDialog } from './MacroEditDialog'
import type { SupportMacro, Role } from '@/lib/types'

interface MacroLibraryProps {
  macros: SupportMacro[]
  viewerRole: Role
  viewerId: string
}

export function MacroLibrary({ macros, viewerRole, viewerId }: MacroLibraryProps) {
  const router = useRouter()
  const [pendingId, setPendingId] = React.useState<string | null>(null)

  async function remove(macro: SupportMacro) {
    if (!confirm(`Delete macro "${macro.title}"? This cannot be undone.`)) return
    setPendingId(macro.id)
    try {
      const res = await fetch(`/api/support/macros/${macro.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(error || 'Delete failed')
      }
      toast.success('Macro deleted')
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message || 'Could not delete macro')
    } finally {
      setPendingId(null)
    }
  }

  if (macros.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-gray-500">
          No macros yet. Click <strong>New macro</strong> to add one.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {macros.map((macro) => {
        const canEdit =
          viewerRole === 'admin' ||
          (macro.owner_id !== null && macro.owner_id === viewerId)
        return (
          <Card key={macro.id} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {macro.title}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">
                    {macro.owner_id ? 'Personal' : 'Team-wide'} · {macro.language}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <MacroEditDialog
                      macro={macro}
                      viewerRole={viewerRole}
                      trigger={
                        <Button variant="ghost" size="icon" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete"
                      disabled={pendingId === macro.id}
                      onClick={() => remove(macro)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap text-xs text-gray-600">
                {macro.body.slice(0, 240)}
                {macro.body.length > 240 ? '…' : ''}
              </p>
              {macro.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {macro.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
