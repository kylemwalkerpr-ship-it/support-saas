import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Bell,
  CheckCircle2,
  CircleDollarSign,
  HelpCircle,
  Scale,
  Timer,
  ShieldCheck,
  Smile,
} from 'lucide-react'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import {
  getAgentMetrics,
  getTeamMetrics,
  type AgentMetrics,
  type MetricsRange,
  type TeamMetrics,
} from '@/lib/actions/support-metrics'
import { Header } from '@/components/dashboard/header'
import { MetricsTile } from '@/components/support/MetricsTile'

type View = 'mine' | 'team'

type SearchParams = Promise<{ view?: string; range?: string }>

const VALID_RANGES: MetricsRange[] = ['today', '7d', '30d']

function formatUSD(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

function formatSeconds(seconds: number | null): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds.toFixed(0)}s`
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

function formatHours(hours: number | null): string {
  if (hours == null) return '—'
  if (hours < 1) return `${(hours * 60).toFixed(0)}m`
  return `${hours.toFixed(1)}h`
}

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const profile = await getOrCreateProfile()
  if (!profile || !['support', 'admin'].includes(profile.role)) {
    redirect('/sign-in')
  }

  const sp = await searchParams
  const viewRaw = sp.view
  const view: View =
    viewRaw === 'mine' || viewRaw === 'team'
      ? viewRaw
      : profile.role === 'admin'
        ? 'team'
        : 'mine'

  // A support agent can't access team view — fall back silently.
  const effectiveView: View = view === 'team' && profile.role !== 'admin' ? 'mine' : view

  const range: MetricsRange =
    sp.range && (VALID_RANGES as string[]).includes(sp.range)
      ? (sp.range as MetricsRange)
      : '7d'

  const metrics: AgentMetrics | TeamMetrics =
    effectiveView === 'team'
      ? await getTeamMetrics({ range })
      : await getAgentMetrics({ range })

  const isAgentScope = effectiveView === 'mine'
  const myOpenNotifications =
    isAgentScope && 'myOpenNotifications' in metrics
      ? (metrics as AgentMetrics).myOpenNotifications
      : null

  return (
    <div>
      <Header
        title="Metrics"
        subtitle={`${effectiveView === 'mine' ? 'My' : 'Team'} performance · ${range === 'today' ? 'today' : range === '7d' ? 'last 7 days' : 'last 30 days'}`}
      />

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500">View:</span>
          <Link
            href={`/metrics?view=mine&range=${range}`}
            className={`rounded-md border px-2.5 py-1 font-medium ${
              effectiveView === 'mine'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Mine
          </Link>
          {profile.role === 'admin' ? (
            <Link
              href={`/metrics?view=team&range=${range}`}
              className={`rounded-md border px-2.5 py-1 font-medium ${
                effectiveView === 'team'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Team
            </Link>
          ) : null}
          <span className="ml-3 text-gray-500">Range:</span>
          {VALID_RANGES.map((r) => (
            <Link
              key={r}
              href={`/metrics?view=${effectiveView}&range=${r}`}
              className={`rounded-md border px-2.5 py-1 font-medium ${
                range === r
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {r === 'today' ? 'Today' : r === '7d' ? '7d' : '30d'}
            </Link>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricsTile
            title="Conversations resolved"
            value={`${metrics.conversationsResolvedToday} · ${metrics.conversationsResolved7d} · ${metrics.conversationsResolved30d}`}
            delta="today · 7d · 30d"
            href="/inbox?inbox_status=resolved"
            icon={CheckCircle2}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-50"
          />
          <MetricsTile
            title="First-response time"
            value={formatSeconds(metrics.firstResponseMedianSeconds)}
            delta={`p50 · p95 ${formatSeconds(metrics.firstResponseP95Seconds)}`}
            href="/inbox"
            icon={Timer}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
          />
          <MetricsTile
            title="Refunds processed"
            value={`${metrics.refundsCount} · ${formatUSD(metrics.refundsTotalCents)}`}
            delta="count · total"
            href="/orders"
            icon={CircleDollarSign}
            iconColor="text-purple-600"
            iconBg="bg-purple-50"
          />
          <MetricsTile
            title="Disputes decided"
            value={metrics.disputesDecidedCount}
            delta={`refund ${metrics.disputesBreakdown.resolved_refund} · release ${metrics.disputesBreakdown.resolved_release} · split ${metrics.disputesBreakdown.resolved_split} · reject ${metrics.disputesBreakdown.rejected}`}
            href="/disputes"
            icon={Scale}
            iconColor="text-rose-600"
            iconBg="bg-rose-50"
          />
          <MetricsTile
            title="Verification time-to-decision"
            value={formatHours(metrics.verificationsMedianHours)}
            delta={`${metrics.verificationsDecidedCount} decided · median`}
            href="/verifications"
            icon={ShieldCheck}
            iconColor="text-amber-600"
            iconBg="bg-amber-50"
          />
          <CsatTile />
          {isAgentScope && myOpenNotifications != null ? (
            <MetricsTile
              title="My open notifications"
              value={myOpenNotifications}
              delta="unread"
              href="/dashboard"
              icon={Bell}
              iconColor="text-gray-700"
              iconBg="bg-gray-100"
            />
          ) : null}
        </div>

        <p className="text-[11px] text-gray-400">
          Metrics derive from <code className="rounded bg-gray-100 px-1">support_audit_log</code>{' '}
          and live tables. First-response time uses{' '}
          <code className="rounded bg-gray-100 px-1">last_customer_message_at</code> versus the
          earliest agent message. Verification times use{' '}
          <code className="rounded bg-gray-100 px-1">attorney_applications.decided_at</code>.
        </p>
      </div>
    </div>
  )
}

function CsatTile() {
  return (
    <div className="group block rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-500">CSAT</p>
          <p className="text-3xl font-bold text-gray-900">0</p>
          <p className="text-xs text-gray-400">
            <span className="mr-1 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              <HelpCircle className="h-3 w-3" /> Coming soon
            </span>
            No post-conversation prompt yet
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 p-3">
          <Smile className="h-6 w-6 text-amber-600" />
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-gray-400">
        Tracking lands with the survey schema
      </p>
    </div>
  )
}

