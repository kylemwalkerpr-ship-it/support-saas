import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/actions/profiles'

export default async function DashboardPage() {
  await auth()
  const profile = await getOrCreateProfile()

  if (!profile) redirect('/sign-in')

  if (profile.role === 'admin') redirect('/admin')
  if (profile.role === 'consultant') redirect('/consultant')
  redirect('/client')
}
