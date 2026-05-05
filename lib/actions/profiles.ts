'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getClerkSessionEmail, getClerkUserId } from '@/lib/auth'
import type { Profile, Role } from '@/lib/types'

type ClerkUserData = {
  email: string | null
  fullName: string | null
  avatarUrl: string | null
}

function supportAvatarUrl(seed: string) {
  return `/api/avatar?seed=${encodeURIComponent(seed || 'Yousafe Support')}`
}

function supportRecoveryEmail(userId: string) {
  return `${userId}@support.yousafe.local`
}

function isRecoveryEmail(email: string | null | undefined) {
  return !!email && email.endsWith('@support.yousafe.local')
}

async function getClerkUserData(userId: string): Promise<ClerkUserData> {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) return { email: null, fullName: null, avatarUrl: null }

  try {
    const response = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      console.error('[profiles] Clerk user lookup failed', response.status)
      return { email: null, fullName: null, avatarUrl: null }
    }

    const user = (await response.json()) as {
      email_addresses?: Array<{ email_address?: string; id?: string }>
      primary_email_address_id?: string
      first_name?: string | null
      last_name?: string | null
      image_url?: string | null
    }

    const primaryEmail =
      user.email_addresses?.find((email) => email.id === user.primary_email_address_id)
        ?.email_address ??
      user.email_addresses?.[0]?.email_address ??
      null
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || null

    return {
      email: primaryEmail?.toLowerCase() ?? null,
      fullName,
      avatarUrl: user.image_url ?? null,
    }
  } catch (error) {
    console.error('[profiles] Clerk user lookup crashed', error)
    return { email: null, fullName: null, avatarUrl: null }
  }
}

async function assertSupportProfile(
  db: ReturnType<typeof createSupabaseAdminClient>,
  profile: Profile
): Promise<Profile> {
  if (profile.role === 'admin') return profile
  if (profile.role === 'support') return profile

  const { data, error } = await db
    .from('profiles')
    .update({ role: 'support', status: 'pending' })
    .eq('id', profile.id)
    .select('*')
    .single()

  if (error) {
    console.error('[profiles] support role assertion failed', error)
    return profile
  }

  return (data as Profile) ?? profile
}

export async function getOrCreateProfile(): Promise<Profile | null> {
  const userId = await getClerkUserId()
  if (!userId) return null

  try {
    const db = createSupabaseAdminClient()
    const sessionEmail = await getClerkSessionEmail()
    const clerkData = await getClerkUserData(userId)
    const email = clerkData.email ?? sessionEmail ?? supportRecoveryEmail(userId)
    const fullName = clerkData.fullName ?? 'Yousafe Support'
    const avatarUrl = clerkData.avatarUrl ?? supportAvatarUrl(fullName || email || userId)

    const { data: existing, error: existingError } = await db
      .from('profiles')
      .select('*')
      .eq('clerk_user_id', userId)
      .maybeSingle()

    if (existingError) {
      console.error('[profiles] clerk lookup failed', existingError)
    }

    if (existing) {
      const updates: Record<string, unknown> = {}

      if (clerkData.email && isRecoveryEmail(existing.email)) updates.email = clerkData.email
      if (clerkData.fullName && !existing.full_name) updates.full_name = clerkData.fullName
      if (clerkData.avatarUrl && !existing.avatar_url) updates.avatar_url = clerkData.avatarUrl
      if (existing.role !== 'admin' && existing.role !== 'support') {
        updates.role = 'support'
        updates.status = 'pending'
      }

      if (Object.keys(updates).length > 0) {
        const { data: refreshed, error: refreshError } = await db
          .from('profiles')
          .update(updates)
          .eq('id', existing.id)
          .select('*')
          .single()

        if (refreshError) console.error('[profiles] support profile refresh failed', refreshError)
        if (refreshed) return refreshed as Profile
      }

      return assertSupportProfile(db, existing as Profile)
    }

    if (clerkData.email || sessionEmail) {
      const lookupEmail = clerkData.email ?? sessionEmail
      const { data: existingByEmail, error: emailLookupError } = await db
        .from('profiles')
        .select('*')
        .eq('email', lookupEmail)
        .maybeSingle()

      if (emailLookupError) {
        console.error('[profiles] email lookup failed', emailLookupError)
      }

      if (existingByEmail) {
        if (
          existingByEmail.clerk_user_id !== userId &&
          ['admin', 'support'].includes(existingByEmail.role)
        ) {
          const { data: linked, error: linkError } = await db
            .from('profiles')
            .update({ clerk_user_id: userId })
            .eq('id', existingByEmail.id)
            .select('*')
            .single()

          if (linkError) console.error('[profiles] relink by email failed', linkError)
          if (linked) return linked as Profile
        }

        if (existingByEmail.clerk_user_id === userId) {
          return assertSupportProfile(db, existingByEmail as Profile)
        }
      }
    }

    const payload = {
      clerk_user_id: userId,
      email,
      full_name: fullName,
      avatar_url: avatarUrl,
      role: 'support',
      status: 'pending',
    }

    const { data: created, error: createError } = await db
      .from('profiles')
      .upsert(payload, { onConflict: 'clerk_user_id', ignoreDuplicates: false })
      .select('*')
      .single()

    if (!createError && created) return created as Profile

    console.error('[profiles] profile upsert failed', createError)

    if (sessionEmail) {
      const { data: relinked, error: relinkError } = await db
        .from('profiles')
        .update({ clerk_user_id: userId })
        .eq('email', sessionEmail)
        .select('*')
        .maybeSingle()

      if (relinkError) console.error('[profiles] final relink failed', relinkError)
      if (relinked) return relinked as Profile
    }

    return null
  } catch (error) {
    console.error('[profiles] getOrCreateProfile recovery failed', error)
    return null
  }
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
