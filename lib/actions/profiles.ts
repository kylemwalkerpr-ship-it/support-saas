'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getClerkSessionEmail, getClerkUserId } from '@/lib/auth'
import type { Profile, Role } from '@/lib/types'

function supportAvatarUrl(seed: string) {
  return `/api/avatar?seed=${encodeURIComponent(seed || 'Yousafe Support')}`
}

export async function getOrCreateProfile(): Promise<Profile | null> {
  const userId = await getClerkUserId()
  if (!userId) return null

  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from('profiles')
    .select('*')
    .eq('clerk_user_id', userId)
    .single()

  if (existing) return existing as Profile

  const email = await getClerkSessionEmail()
  if (email) {
    const { data: existingByEmail } = await db
      .from('profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle()

    if (existingByEmail) return existingByEmail as Profile
  }

  const { data: created } = await db
    .from('profiles')
    .insert({
      clerk_user_id: userId,
      email: email || '',
      full_name: 'Yousafe Support',
      avatar_url: supportAvatarUrl(userId),
      role: 'support',
      status: 'pending',
    })
    .select('*')
    .single()

  return (created as Profile) ?? null
}

export async function setProfileRole(role: Role): Promise<Profile | null> {
  const userId = await getClerkUserId()
  if (!userId) return null

  const db = createSupabaseAdminClient()
  const status = role === 'support' ? 'pending' : 'active'
  const { data } = await db
    .from('profiles')
    .update({ role, status })
    .eq('clerk_user_id', userId)
    .select('*')
    .single()

  return (data as Profile) ?? null
}

export async function completeSupportProfile(input: {
  fullName: string
  avatarSeed: string
}): Promise<Profile | null> {
  const userId = await getClerkUserId()
  if (!userId) return null

  const fullName = input.fullName.trim()
  if (fullName.length < 2) throw new Error('Full name is required')

  const db = createSupabaseAdminClient()
  const { data } = await db
    .from('profiles')
    .update({
      role: 'support',
      status: 'pending',
      full_name: fullName,
      avatar_url: supportAvatarUrl(input.avatarSeed || fullName),
    })
    .eq('clerk_user_id', userId)
    .select('*')
    .single()

  return (data as Profile) ?? null
}

export async function setSupportStatus(
  profileId: string,
  status: 'active' | 'suspended'
): Promise<void> {
  const userId = await getClerkUserId()
  if (!userId) throw new Error('Unauthorized')

  const db = createSupabaseAdminClient()
  const { data: me } = await db
    .from('profiles')
    .select('role')
    .eq('clerk_user_id', userId)
    .single()

  if (me?.role !== 'admin') throw new Error('Forbidden')

  await db.from('profiles').update({ status }).eq('id', profileId)
}

export async function getPendingSupportAgents(): Promise<Profile[]> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from('profiles')
    .select('*')
    .eq('role', 'support')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  return (data as Profile[]) ?? []
}

export async function updateProfile(updates: {
  full_name?: string
  bio?: string
  avatar_url?: string
}): Promise<Profile | null> {
  const userId = await getClerkUserId()
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
  const userId = await getClerkUserId()
  if (!userId) return []

  const db = createSupabaseAdminClient()
  const { data } = await db
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  return (data as Profile[]) ?? []
}

export async function updateUserRole(profileId: string, role: Role): Promise<void> {
  const userId = await getClerkUserId()
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

export async function deleteProfile(profileId: string): Promise<void> {
  const userId = await getClerkUserId()
  if (!userId) throw new Error('Unauthorized')

  const db = createSupabaseAdminClient()
  const { data: me } = await db
    .from('profiles')
    .select('role')
    .eq('clerk_user_id', userId)
    .single()

  if (me?.role !== 'admin') throw new Error('Forbidden')

  await db.from('profiles').delete().eq('id', profileId)
}
