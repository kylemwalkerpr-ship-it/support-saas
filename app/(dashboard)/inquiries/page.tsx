import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { InquiriesPanel } from '@/components/dashboard/inquiries-panel'

export default async function InquiriesPage() {
  const profile = await getOrCreateProfile()
  if (!profile || !['admin', 'support'].includes(profile.role)) {
    redirect('/sign-in')
  }

  return (
    <div className="p-6">
      <InquiriesPanel />
    </div>
  )
}
