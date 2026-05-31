'use client'

import { useState } from 'react'
import { ClipboardCopy, Check } from 'lucide-react'

interface AuditDetailExpanderProps {
  metadata: Record<string, unknown> | null
}

export function AuditDetailExpander({ metadata }: AuditDetailExpanderProps) {
  const [copied, setCopied] = useState(false)
  const pretty = JSON.stringify(metadata ?? {}, null, 2)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(pretty)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard may be unavailable in restricted browsers; silently skip.
    }
  }

  return (
    <details className="rounded-md border border-gray-200 bg-gray-50">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100">
        View metadata
      </summary>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
            metadata
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" /> Copied
              </>
            ) : (
              <>
                <ClipboardCopy className="h-3 w-3" /> Copy JSON
              </>
            )}
          </button>
        </div>
        <pre className="max-h-72 overflow-auto rounded-md bg-white p-3 text-[11px] leading-snug text-gray-800">
          {pretty}
        </pre>
      </div>
    </details>
  )
}
