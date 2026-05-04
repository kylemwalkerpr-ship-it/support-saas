import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { getSupportDashboardData } from '@/lib/actions/chat'
import { SupportDashboard } from '@/components/chat/support-dashboard'
import { Mail } from 'lucide-react'

export default async function AdminChatConsolePage() {
  const profile = await getOrCreateProfile()
  if (!profile || !['admin', 'support'].includes(profile.role)) {
    redirect('/sign-in')
  }

  if (profile.role === 'support' && profile.status !== 'active') {
    return null
  }

  let data
  try {
    data = await getSupportDashboardData()
  } catch (error) {
    console.error('[support-dashboard] recovery fallback', error)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 mb-6">
            <Mail className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Account refresh needed
          </h1>
          <p className="text-gray-500 leading-relaxed mb-6">
            Your support account was recently reactivated. Please sign out and
            sign in again so the workspace can reconnect your profile.
          </p>
          <a
            href="/sign-in"
            className="inline-flex rounded-lg bg-[#3C3B6E] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Return to sign in
          </a>
        </div>
      </div>
    )
  }

  return <SupportDashboard initialData={data} />
}
