'use client'

import { useState } from 'react'
import { Download, ExternalLink, Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { VerificationDoc } from '@/lib/actions/support-verifications'

interface VerificationDocViewerProps {
  documents: VerificationDoc[]
}

/**
 * Phase 6 best-effort viewer:
 *  - PDF: plain <iframe src={url}>. We deliberately do NOT add react-pdf
 *    (would be a new package and out of scope for Phase 6).
 *  - Image: <img> with click-to-fullscreen toggle.
 *  - Link: rendered as an "Open" button (used for video intros and
 *    arbitrary applicant-supplied URLs we can't classify).
 *
 * All docs also get a Download button that respects the browser default
 * (works for same-origin storage URLs; cross-origin falls back to navigation).
 */
export function VerificationDocViewer({ documents }: VerificationDocViewerProps) {
  const [active, setActive] = useState<number>(0)
  const [fullscreen, setFullscreen] = useState(false)

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-xs text-gray-500">
        No documents attached to this application.
      </div>
    )
  }

  const doc = documents[Math.min(active, documents.length - 1)]

  return (
    <div className="space-y-3">
      {documents.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {documents.map((d, i) => (
            <button
              key={`${d.label}-${i}`}
              onClick={() => setActive(i)}
              className={
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors ' +
                (i === active
                  ? 'bg-[#3C3B6E] text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50')
              }
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 text-xs">
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-700">{doc.label}</p>
            <p className="truncate text-[11px] text-gray-400">{doc.url}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {doc.kind === 'image' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFullscreen((v) => !v)}
              >
                {fullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild>
              <a href={doc.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href={doc.url} download>
                <Download className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>

        <div className={fullscreen ? 'fixed inset-0 z-50 bg-black/90 p-6' : ''}>
          {fullscreen && (
            <button
              onClick={() => setFullscreen(false)}
              className="absolute right-4 top-4 rounded-md bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
            >
              Close
            </button>
          )}
          {doc.kind === 'pdf' ? (
            <iframe
              key={doc.url}
              src={doc.url}
              title={doc.label}
              className={
                fullscreen
                  ? 'h-full w-full rounded-md bg-white'
                  : 'h-[560px] w-full rounded-b-lg'
              }
            />
          ) : doc.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doc.url}
              alt={doc.label}
              className={
                fullscreen
                  ? 'mx-auto h-full max-h-full w-auto max-w-full object-contain'
                  : 'mx-auto max-h-[560px] w-auto rounded-b-lg'
              }
              onClick={() => setFullscreen((v) => !v)}
            />
          ) : (
            <div className="p-6 text-center">
              <p className="text-sm text-gray-600">
                This document is a link. Open it in a new tab to review.
              </p>
              <Button asChild className="mt-3" size="sm">
                <a href={doc.url} target="_blank" rel="noopener noreferrer">
                  Open link
                </a>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
