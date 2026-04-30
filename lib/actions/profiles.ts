'use server'

import { auth } from '@clerk/nextjs/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import type { Profile, Role } from '@/lib/types'

export async function getOrCreateProfile(): Promise<Profile | null> {
  const { userId, sessionClaims } = await auth()
  if (!userId) return null

  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from('profiles')
    .select('*')
    .eq('clerk_user_id', userId)
    .single()

  if (existing) return existing as Profile

  // First time — create profile from Clerk session claims
  const email =
    (sessionClaims?.email as string) ??
    (sessionClaims?.primaryEmail as string) ??
    ''
  const fullName =
    (sessionClaims?.fullName as string) ??
    (sessionClaims?.name as string) ??
    null

  const { data: created } = await db
    .from('profiles')
    .insert({ clerk_user_id: userId, email, full_name: fullName })
    .select('*')
    .single()

  return (created as Profile) ?? null
}

export async function setProfileRole(role: Role): Promise<Profile | null> {
  const { userId } = await auth()
  if (!userId) return null

  const db = createSupabaseAdminClient()

  const { data } = await db
    .from('profiles')
    .update({ role })
    .eq('clerk_user_id', userId)
    .select('*')
    .single()

  return (data as Profile) ?? null
}

export async function updateProfile(updates: {
  full_name?: string
  bio?: string
  avatar_url?: string
}): Promise<Profile | null> {
  const { userId } = await auth()
  if (!userId) return null

  const db = createSupabaseAdminClient()

  const { data } = await db
    .from('profiles')
    .update(updates)
    .eq('clerk_user_id', userId)
    .select('*')
    .single()

  return (data as Profile) ?? null
}

export async function getAllProfiles(): Promise<Profile[]> {
  const { userId } = await auth()
  if (!userId) return []

  const db = createSupabaseAdminClient()
  const { data } = await db
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  return (data as Profile[]) ?? []
}

export async function updateUserRole(
  profileId: string,
  role: Role
): Promise<void> {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const db = createSupabaseAdminClient()
  const { data: me } = await db
    .from('profiles')
    .select('role')
    .eq('clerk_user_id', userId)
    .single()

  if (me?.role !== 'admin') throw new Error('Forbidden')

  await db.from('profiles').update({ role }).eq('id', profileId)
}
