import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { getClerkUserId } from '@/lib/auth'
import { Sidebar } from '@/components/dashboard/sidebar'
import { ThemeProvider } from '@/components/dashboard/theme-provider'
import { Toaster } from 'sonner'
import { AlertTriangle, Clock, Mail } from 'lucide-react'

function isRecoveryEmail(email: string | null | undefined) {
  return !!email && email.endsWith('@support.yousafe.local')
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const userId = await getClerkUserId()
  if (!userId) redirect('/sign-in')

  const profile = await getOrCreateProfile()
  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 mb-6">
            <AlertTriangle className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Account Refresh Needed
          </h1>
          <p className="text-gray-500 leading-relaxed mb-6">
            Your support session is active, but we could not finish refreshing
            your support profile. Sign in again to rebuild the session cleanly.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a
              href="/sign-in"
              className="inline-flex justify-center rounded-lg bg-[#3C3B6E] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Sign in again
            </a>
            <a
              href="mailto:support@yousafeconsultancy.com"
              className="inline-flex justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-white"
            >
              Contact support
            </a>
          </div>
        </div>
        <Toaster richColors position="top-right" />
      </div>
    )
  }

  if (!['admin', 'support'].includes(profile.role)) {
    const portalUrl = 'https://portal.yousafeconsultancy.com/dashboard'
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 mb-6">
            <Mail className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Use Your Portal Dashboard
          </h1>
          <p className="text-gray-500 leading-relaxed mb-6">
            This support workspace is only for approved support staff. Your
            account is registered as {profile.role}, so continue in the portal.
          </p>
          <a
            href={portalUrl}
            className="inline-flex rounded-lg bg-[#3C3B6E] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Open portal dashboard
          </a>
        </div>
        <Toaster richColors position="top-right" />
      </div>
    )
  }

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
              <p className="text-sm text-gray-500">
                {isRecoveryEmail(profile.email) ? 'your account email' : profile.email}
              </p>
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
    <ThemeProvider>
      <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
        <Sidebar
          role={profile.role}
          userName={profile.full_name}
          userEmail={profile.email}
          avatarUrl={profile.avatar_url}
        />
        <div className="flex min-w-0 flex-1 flex-col md:pl-64">
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
        <Toaster richColors position="top-right" />
      </div>
    </ThemeProvider>
  )
}
