import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { searchAuditLog } from '@/lib/actions/support-audit-viewer'
import { Header } from '@/components/dashboard/header'
import { AuditFilterBar } from '@/components/support/AuditFilterBar'
import { AuditLogTable } from '@/components/support/AuditLogTable'

type SearchParams = Promise<{
  actor?: string
  action?: string
  target_type?: string
  dateFrom?: string
  dateTo?: string
  q?: string
  cursor?: string
}>

export default async function AuditPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const profile = await getOrCreateProfile()
  if (!profile || !['support', 'admin'].includes(profile.role)) {
    redirect('/sign-in')
  }

  const sp = await searchParams

  const result = await searchAuditLog({
    actor: sp.actor ?? null,
    action: sp.action ?? null,
    target_type: sp.target_type ?? null,
    dateFrom: sp.dateFrom ?? null,
    dateTo: sp.dateTo ?? null,
    q: sp.q ?? null,
    cursor: sp.cursor ?? null,
    limit: 30,
  })

  function withCursor(c: string | null): string {
    const params = new URLSearchParams()
    if (sp.actor) params.set('actor', sp.actor)
    if (sp.action) params.set('action', sp.action)
    if (sp.target_type) params.set('target_type', sp.target_type)
    if (sp.dateFrom) params.set('dateFrom', sp.dateFrom)
    if (sp.dateTo) params.set('dateTo', sp.dateTo)
    if (sp.q) params.set('q', sp.q)
    if (c) params.set('cursor', c)
    const qs = params.toString()
    return qs ? `/audit?${qs}` : '/audit'
  }

  const isAdmin = profile.role === 'admin'

  return (
    <div>
      <Header
        title="Audit log"
        subtitle={`${result.total.toLocaleString()} events matching · showing ${result.rows.length} · default view: last 7 days`}
      />

      <div className="space-y-4 p-6">
        <AuditFilterBar isAdmin={isAdmin} totalForExport={result.total} />

        <AuditLogTable rows={result.rows} />

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Showing {result.rows.length} of {result.total.toLocaleString()}
          </span>
          {result.nextCursor ? (
            <Link
              href={withCursor(result.nextCursor)}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
            >
              Load older →
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
