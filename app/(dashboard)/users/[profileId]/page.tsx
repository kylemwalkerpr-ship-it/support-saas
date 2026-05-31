import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { getUserById } from '@/lib/actions/support-users'
import { SupportActionError } from '@/lib/actions/support-audit'
import { Header } from '@/components/dashboard/header'
import { User360 } from '@/components/support/User360'

type Params = Promise<{ profileId: string }>

export default async function UserDetailPage({ params }: { params: Params }) {
  const viewer = await getOrCreateProfile()
  if (!viewer || !['support', 'admin'].includes(viewer.role)) {
    redirect('/sign-in')
  }

  const { profileId } = await params

  let bundle
  try {
    bundle = await getUserById(profileId)
  } catch (error) {
    if (error instanceof SupportActionError && error.code === 'not_found') {
      notFound()
    }
    throw error
  }

  return (
    <div>
      <Header
        title={bundle.profile.full_name ?? bundle.profile.email}
        subtitle={`Profile ${bundle.profile.id.slice(0, 8)}…`}
      />
      <div className="space-y-4 p-6">
        <Link
          href="/users"
          className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="mr-1 h-3.5 w-3.5" />
          Back to users
        </Link>
        <User360 bundle={bundle} viewerRole={viewer.role} />
      </div>
    </div>
  )
}
