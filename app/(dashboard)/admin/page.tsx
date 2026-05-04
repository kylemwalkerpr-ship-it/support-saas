import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { getSupportDashboardData } from '@/lib/actions/chat'
import { SupportDashboard } from '@/components/chat/support-dashboard'

export default async function AdminChatConsolePage() {
  const profile = await getOrCreateProfile()
  if (!profile || !['admin', 'consultant'].includes(profile.role)) {
    redirect('/client')
  }

  const data = await getSupportDashboardData()
  return <SupportDashboard initialData={data} />
}
