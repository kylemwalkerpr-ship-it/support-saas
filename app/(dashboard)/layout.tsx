import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { getClerkUserId } from '@/lib/auth'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Toaster } from 'sonner'
import { Clock, Mail } from 'lucide-react'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const userId = await getClerkUserId()
  if (!userId) redirect('/sign-in')

  const profile = await getOrCreateProfile()
  if (!profile) redirect('/sign-in')

  // Pending support agents see a holding screen — not the dashboard
  if (profile.role === 'support' && profile.status === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100 mb-6">
            <Clock className="h-8 w-8 text-yellow-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Application Under Review
          </h1>
          <p className="text-gray-500 leading-relaxed mb-6">
            Your support access is waiting for admin approval. You'll receive
            confirmation once an admin activates your account.
          </p>
          <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3 text-left">
            <div className="rounded-lg bg-blue-50 p-2 shrink-0">
              <Mail className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                We'll notify you at
              </p>
              <p className="text-sm text-gray-500">{profile.email}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-6">
            Questions? Contact{' '}
            <a
              href="mailto:support@yousafeconsultancy.com"
              className="text-blue-600 hover:underline"
            >
              support@yousafeconsultancy.com
            </a>
          </p>
        </div>
        <Toaster richColors position="top-right" />
      </div>
    )
  }

  // Suspended users
  if (profile.status === 'suspended') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 mb-6">
            <span className="text-3xl">🚫</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Account Suspended
          </h1>
          <p className="text-gray-500 mb-6">
            Your account has been suspended. Please contact support if you
            believe this is a mistake.
          </p>
          <a
            href="mailto:support@yousafeconsultancy.com"
            className="text-blue-600 hover:underline text-sm"
          >
            support@yousafeconsultancy.com
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        role={profile.role}
        userName={profile.full_name}
        userEmail={profile.email}
        avatarUrl={profile.avatar_url}
      />
      <div className="flex flex-1 flex-col pl-64">
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <Toaster richColors position="top-right" />
    </div>
  )
}
