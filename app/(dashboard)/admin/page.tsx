import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { getSupportDashboardData } from '@/lib/actions/chat'
import { SupportDashboard } from '@/components/chat/support-dashboard'

export default async function AdminChatConsolePage() {
  const profile = await getOrCreateProfile()
  if (!profile || !['admin', 'support'].includes(profile.role)) {
    redirect('/sign-in')
  }

  if (profile.role === 'support' && profile.status !== 'active') {
    return null
  }

  const data = await getSupportDashboardData()
  return <SupportDashboard initialData={data} />
}
