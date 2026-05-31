import { redirect } from 'next/navigation'
import {
  MessagesSquare,
  Scale,
  ShieldCheck,
  Flag,
  CircleDollarSign,
  Bell,
} from 'lucide-react'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { getHomeMetrics } from '@/lib/actions/support-metrics'
import { Header } from '@/components/dashboard/header'
import { MetricsTile } from '@/components/support/MetricsTile'

function formatUSD(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

export default async function DashboardPage() {
  const profile = await getOrCreateProfile()
  if (!profile || !['admin', 'support'].includes(profile.role)) {
    redirect('/sign-in')
  }

  const metrics = await getHomeMetrics()

  return (
    <div>
      <Header
        title={`Welcome${profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}`}
        subtitle="Agent home — phase 9 will deepen these metrics"
      />

      <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-3">
        <MetricsTile
          title="My open conversations"
          value={metrics.openConversationsAssignedToMe}
          delta="assigned to me"
          href="/inbox"
          icon={MessagesSquare}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <MetricsTile
          title="Open disputes"
          value={metrics.openDisputesTeamWide}
          delta="team-wide"
          href="/orders?hasOpenDispute=1"
          icon={Scale}
          iconColor="text-rose-600"
          iconBg="bg-rose-50"
        />
        <MetricsTile
          title="Pending verifications"
          value={metrics.pendingVerifications}
          delta="phase 6 will deepen this"
          href="/dashboard"
          icon={ShieldCheck}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <MetricsTile
          title="Flagged content"
          value={metrics.flaggedContentLast24h}
          delta="last 24h"
          href="/dashboard"
          icon={Flag}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <MetricsTile
          title="Refunds today"
          value={`${metrics.refundsTodayCount} · ${formatUSD(metrics.refundsTodayTotalCents)}`}
          delta="processed since 00:00 UTC"
          href="/orders"
          icon={CircleDollarSign}
          iconColor="text-purple-600"
          iconBg="bg-purple-50"
        />
        <MetricsTile
          title="My notifications"
          value={metrics.myOpenNotifications}
          delta="unread"
          href="/dashboard"
          icon={Bell}
          iconColor="text-gray-700"
          iconBg="bg-gray-100"
        />
      </div>
    </div>
  )
}
