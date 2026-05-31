import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import {
  searchVerifications,
  type VerificationType,
  type VerificationStatus,
} from '@/lib/actions/support-verifications'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent } from '@/components/ui/card'
import { VerificationQueueTabs } from '@/components/support/VerificationQueueTabs'
import { VerificationQueueList } from '@/components/support/VerificationQueueList'

const VALID_TYPES: VerificationType[] = ['attorney', 'consultant', 'id', 'bar']
const VALID_STATUSES: VerificationStatus[] = [
  'pending',
  'approved',
  'declined',
  'changes_requested',
  'waitlist',
]

type SearchParams = Promise<{
  type?: string
  status?: string
  cursor?: string
}>

function placeholderCopy(type: VerificationType): string {
  if (type === 'id') {
    return 'ID document verification table is not provisioned yet — the queue will appear here once the portal ships KYC.'
  }
  return 'Bar number verification table is not provisioned yet — the queue will appear here once the portal ships automated bar lookups.'
}

export default async function VerificationsQueuePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const profile = await getOrCreateProfile()
  if (!profile || !['support', 'admin'].includes(profile.role)) {
    redirect('/sign-in')
  }

  const sp = await searchParams
  const typeRaw = sp.type
  const type: VerificationType =
    typeRaw && (VALID_TYPES as string[]).includes(typeRaw)
      ? (typeRaw as VerificationType)
      : 'attorney'
  const statusRaw = sp.status
  const status: VerificationStatus | undefined =
    statusRaw && (VALID_STATUSES as string[]).includes(statusRaw)
      ? (statusRaw as VerificationStatus)
      : undefined
  const cursor = typeof sp.cursor === 'string' ? sp.cursor : null

  const isPlaceholder = type === 'id' || type === 'bar'

  const { rows, nextCursor, total } = await searchVerifications({
    type,
    status,
    cursor: cursor ?? undefined,
    limit: 50,
  })

  const baseSp = new URLSearchParams()
  baseSp.set('type', type)
  if (status) baseSp.set('status', status)

  function withCursor(c: string | null): string {
    const out = new URLSearchParams(baseSp.toString())
    if (c) out.set('cursor', c)
    const qs = out.toString()
    return qs ? `/verifications?${qs}` : '/verifications'
  }

  function withStatus(s: VerificationStatus | undefined): string {
    const out = new URLSearchParams()
    out.set('type', type)
    if (s) out.set('status', s)
    return `/verifications?${out.toString()}`
  }

  const activeStatus = status ?? 'pending'

  return (
    <div>
      <Header
        title="Verifications"
        subtitle={`${total.toLocaleString()} matching · showing ${rows.length}`}
      />

      <div className="space-y-4 p-6">
        <VerificationQueueTabs active={type} />

        {!isPlaceholder && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(['pending', 'approved', 'declined'] as VerificationStatus[]).map(
              (s) => (
                <Link
                  key={s}
                  href={withStatus(s)}
                  className={
                    'rounded-full px-2.5 py-1 font-medium ' +
                    (s === activeStatus
                      ? 'bg-[#3C3B6E] text-white'
                      : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50')
                  }
                >
                  {s}
                </Link>
              )
            )}
          </div>
        )}

        {isPlaceholder ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-gray-500">
              {placeholderCopy(type)}
            </CardContent>
          </Card>
        ) : (
          <VerificationQueueList rows={rows} type={type} />
        )}

        {!isPlaceholder && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              Showing {rows.length} of {total.toLocaleString()}
            </span>
            {nextCursor ? (
              <Link
                href={withCursor(nextCursor)}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
              >
                Load older →
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
