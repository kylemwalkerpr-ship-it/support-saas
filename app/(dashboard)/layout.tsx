import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Toaster } from 'sonner'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const profile = await getOrCreateProfile()

  if (!profile) redirect('/sign-in')

  // New users without a role selected (default is 'client' from DB, but we
  // can still send them to onboarding if they haven't explicitly chosen)
  // For now, onboarding only happens if explicitly navigated to.

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
