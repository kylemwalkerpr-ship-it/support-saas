'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ModerationDecisionBar } from '@/components/support/ModerationDecisionBar'
import type { FlagBundle } from '@/lib/actions/support-moderation'

interface ModerationDetailDialogProps {
  flagId: string | null
  onClose: () => void
}

export function ModerationDetailDialog({
  flagId,
  onClose,
}: ModerationDetailDialogProps) {
  const router = useRouter()
  const [bundle, setBundle] = useState<FlagBundle | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!flagId) {
      setBundle(null)
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/support/moderation/${flagId}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((json: FlagBundle | { error: string }) => {
        if (cancelled) return
        if ('error' in json) {
          toast.error(json.error)
          onClose()
          return
        }
        setBundle(json)
      })
      .catch((err) => {
        if (cancelled) return
        toast.error('Could not load flag detail')
        console.error('[ModerationDetailDialog] load failed', err)
        onClose()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [flagId, onClose])

  const open = !!flagId

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-gray-900">
            Flag detail
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            Review the flagged content, then choose a decision.
          </DialogDescription>
        </DialogHeader>

        {loading || !bundle ? (
          <div className="py-10 text-center text-sm text-gray-500">Loading…</div>
        ) : (
          <DetailBody
            bundle={bundle}
            onDecided={() => {
              onClose()
              router.refresh()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DetailBody({
  bundle,
  onDecided,
}: {
  bundle: FlagBundle
  onDecided: () => void
}) {
  const { flag } = bundle
  const candidate = resolveCandidate(bundle)

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
            {flag.target_type}
          </span>
          <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
            {flag.category}
          </span>
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            {flag.status}
          </span>
          {bundle.flagger ? (
            <span className="ml-auto text-xs text-gray-500">
              Flagged by {bundle.flagger.label}
            </span>
          ) : (
            <span className="ml-auto text-xs text-gray-500">System flag</span>
          )}
        </div>
        <p className="mt-2 text-sm text-gray-800">{flag.reason}</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Target content
        </h3>
        {bundle.target_missing ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
            Target row was deleted before review. The flag remains for audit.
          </div>
        ) : (
          <TargetRenderer bundle={bundle} />
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Decision
        </h3>
        <ModerationDecisionBar
          flagId={flag.id}
          candidateUserId={candidate.userId}
          candidateUserLabel={candidate.label}
          onDecided={onDecided}
        />
      </section>
    </div>
  )
}

function resolveCandidate(bundle: FlagBundle): {
  userId: string | null
  label: string | null
} {
  if (bundle.target_type === 'gig' && bundle.gig?.seller_id)
    return { userId: bundle.gig.seller_id, label: bundle.gig.title ?? null }
  if (bundle.target_type === 'review' && bundle.review?.reviewer_id)
    return { userId: bundle.review.reviewer_id, label: null }
  if (bundle.target_type === 'message' && bundle.message?.sender_id)
    return {
      userId: bundle.message.sender_id,
      label: bundle.message.sender_label,
    }
  if (bundle.target_type === 'profile' && bundle.profile?.id)
    return {
      userId: bundle.profile.id,
      label: bundle.profile.full_name ?? bundle.profile.email ?? null,
    }
  return { userId: null, label: null }
}

function TargetRenderer({ bundle }: { bundle: FlagBundle }) {
  if (bundle.target_type === 'gig' && bundle.gig) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <p className="font-semibold text-gray-900">
          {bundle.gig.title ?? 'Untitled gig'}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
          {bundle.gig.description ?? '(no description)'}
        </p>
        {bundle.gig.is_hidden && (
          <p className="mt-2 text-xs text-gray-500">Already hidden.</p>
        )}
      </div>
    )
  }
  if (bundle.target_type === 'review' && bundle.review) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <p className="text-xs text-gray-500">
          Rating: {bundle.review.rating ?? '—'}/5
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
          {bundle.review.body ?? '(no body)'}
        </p>
      </div>
    )
  }
  if (bundle.target_type === 'message' && bundle.message) {
    return (
      <div className="space-y-2">
        {bundle.message.context.length > 0 && (
          <div className="space-y-1 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Preceding messages
            </p>
            {bundle.message.context.map((m) => (
              <p key={m.id}>
                <span className="font-medium text-gray-700">
                  {m.sender_label ?? 'Unknown'}:
                </span>{' '}
                {m.body}
              </p>
            ))}
          </div>
        )}
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">
            {bundle.message.sender_label ?? 'Unknown sender'}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
            {bundle.message.body ?? '(empty)'}
          </p>
        </div>
      </div>
    )
  }
  if (bundle.target_type === 'profile' && bundle.profile) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <p className="font-semibold text-gray-900">
          {bundle.profile.full_name ?? 'Unnamed profile'}
        </p>
        <p className="text-xs text-gray-500">
          {bundle.profile.email} · role: {bundle.profile.role} · status:{' '}
          {bundle.profile.status}
        </p>
        {bundle.profile.bio && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
            {bundle.profile.bio}
          </p>
        )}
      </div>
    )
  }
  return null
}
