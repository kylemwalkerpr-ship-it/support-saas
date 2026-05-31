import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { searchFlags } from '@/lib/actions/support-moderation'
import type {
  ModerationStatus,
  ModerationCategory,
  ModerationTargetType,
} from '@/lib/types'
import { ModerationQueueList } from '@/components/support/ModerationQueueList'

const TARGET_TABS: { key: ModerationTargetType; label: string }[] = [
  { key: 'gig', label: 'Gigs' },
  { key: 'message', label: 'Messages' },
  { key: 'review', label: 'Reviews' },
  { key: 'profile', label: 'Profiles' },
]

const STATUS_OPTIONS: ModerationStatus[] = ['pending', 'dismissed', 'actioned']
const CATEGORY_OPTIONS: ModerationCategory[] = [
  'spam',
  'abuse',
  'scam',
  'duplicate',
  'other',
]

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function pickType(raw: string | string[] | undefined): ModerationTargetType {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (v === 'message' || v === 'review' || v === 'profile') return v
  return 'gig'
}

function pickStatuses(raw: string | string[] | undefined): ModerationStatus[] {
  if (!raw) return ['pending']
  const parts = (Array.isArray(raw) ? raw : raw.split(',')).map((s) => s.trim())
  const set = parts.filter((p): p is ModerationStatus =>
    STATUS_OPTIONS.includes(p as ModerationStatus),
  )
  return set.length > 0 ? set : ['pending']
}

function pickCategories(
  raw: string | string[] | undefined,
): ModerationCategory[] | undefined {
  if (!raw) return undefined
  const parts = (Array.isArray(raw) ? raw : raw.split(',')).map((s) => s.trim())
  const set = parts.filter((p): p is ModerationCategory =>
    CATEGORY_OPTIONS.includes(p as ModerationCategory),
  )
  return set.length > 0 ? set : undefined
}

export default async function ModerationQueuePage({ searchParams }: PageProps) {
  const profile = await getOrCreateProfile()
  if (!profile) redirect('/sign-in')
  if (profile.role !== 'support' && profile.role !== 'admin') redirect('/dashboard')

  const params = await searchParams
  const target_type = pickType(params.type)
  const statuses = pickStatuses(params.status)
  const categories = pickCategories(params.category)

  const result = await searchFlags({
    target_type,
    status: statuses,
    category: categories,
    limit: 50,
  })

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Trust &amp; safety
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            Moderation queue
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Triage reported content. Hidden items stop appearing in
            buyer-facing surfaces once portal render paths honour{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
              is_hidden = false
            </code>
            .
          </p>
        </div>
      </header>

      {/* Target type tabs (URL-param driven) */}
      <nav className="mb-4 flex flex-wrap gap-2 border-b border-gray-200">
        {TARGET_TABS.map((tab) => {
          const isActive = tab.key === target_type
          const next = new URLSearchParams()
          next.set('type', tab.key)
          if (categories && categories.length > 0)
            next.set('category', categories.join(','))
          if (statuses.join(',') !== 'pending')
            next.set('status', statuses.join(','))
          return (
            <a
              key={tab.key}
              href={`/moderation?${next.toString()}`}
              className={
                isActive
                  ? 'border-b-2 border-[#3C3B6E] px-3 py-2 text-sm font-semibold text-[#3C3B6E]'
                  : 'border-b-2 border-transparent px-3 py-2 text-sm text-gray-500 hover:text-gray-700'
              }
            >
              {tab.label}
            </a>
          )
        })}
      </nav>

      {/* Status + category filter chips (URL-param driven, no client state) */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500">Status:</span>
        {STATUS_OPTIONS.map((s) => {
          const active = statuses.includes(s)
          const next = new URLSearchParams()
          next.set('type', target_type)
          if (categories && categories.length > 0)
            next.set('category', categories.join(','))
          const nextStatuses = active
            ? statuses.filter((x) => x !== s)
            : [...statuses, s]
          if (nextStatuses.length > 0 && nextStatuses.join(',') !== 'pending')
            next.set('status', nextStatuses.join(','))
          return (
            <a
              key={s}
              href={`/moderation?${next.toString()}`}
              className={
                active
                  ? 'rounded-full border border-[#3C3B6E] bg-[#3C3B6E] px-3 py-1 font-medium text-white'
                  : 'rounded-full border border-gray-200 bg-white px-3 py-1 font-medium text-gray-600 hover:border-gray-300'
              }
            >
              {s}
            </a>
          )
        })}
        <span className="ml-3 text-gray-500">Category:</span>
        {CATEGORY_OPTIONS.map((c) => {
          const active = categories?.includes(c) ?? false
          const next = new URLSearchParams()
          next.set('type', target_type)
          if (statuses.join(',') !== 'pending') next.set('status', statuses.join(','))
          const nextCategories = active
            ? (categories ?? []).filter((x) => x !== c)
            : [...(categories ?? []), c]
          if (nextCategories.length > 0)
            next.set('category', nextCategories.join(','))
          return (
            <a
              key={c}
              href={`/moderation?${next.toString()}`}
              className={
                active
                  ? 'rounded-full border border-[#3C3B6E] bg-[#3C3B6E] px-3 py-1 font-medium text-white'
                  : 'rounded-full border border-gray-200 bg-white px-3 py-1 font-medium text-gray-600 hover:border-gray-300'
              }
            >
              {c}
            </a>
          )
        })}
      </div>

      <ModerationQueueList
        initialRows={result.rows}
        totalCount={result.total}
        isAdmin={profile.role === 'admin'}
      />
    </div>
  )
}
