'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getClerkSessionEmail, getClerkUserId } from '@/lib/auth'
import type { Profile, Role } from '@/lib/types'
import {
  canRelinkByEmail,
  identityBackfillPatch,
  isStaffRole,
  selfEditablePatch,
} from '@/lib/support-profile-policy.mjs'

type ClerkUserData = {
  email: string | null
  fullName: string | null
  avatarUrl: string | null
}

function supportAvatarUrl(seed: string) {
  return `/api/avatar?seed=${encodeURIComponent(seed || 'Yousafe Support')}`
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

/**
 * Resolve the signed-in user's profile for the support workspace.
 *
 * The `profiles` table is shared with the portal/marketplace, so this NEVER
 * changes role/status and NEVER creates a row (see lib/support-profile-policy.mjs
 * for the 2026-10-01 regression this prevents). Non-staff rows are returned
 * untouched so the dashboard layout can send the person back to the portal.
 * Returns null when the Clerk user has no profile yet.
 */
export async function getOrCreateProfile(): Promise<Profile | null> {
  const userId = await getClerkUserId()
  if (!userId) return null

  try {
    const db = createSupabaseAdminClient()

    const { data: existing, error: existingError } = await db
      .from('profiles')
      .select('*')
      .eq('clerk_user_id', userId)
      .maybeSingle()

    if (existingError) {
      console.error('[profiles] clerk lookup failed', existingError)
    }

    if (existing) {
      // Only staff rows get identity backfills from the support site; a
      // customer/provider row is portal-owned and is returned untouched.
      if (!isStaffRole(existing.role)) return existing as Profile
      const clerkData = await getClerkUserData(userId)
      const updates = identityBackfillPatch(existing, {
        email: clerkData.email,
        fullName: clerkData.fullName,
        avatarUrl: clerkData.avatarUrl ?? supportAvatarUrl(clerkData.fullName || existing.email || userId),
      })
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
      return existing as Profile
    }

    // No row for this Clerk id: only a STAFF row may be relinked by verified
    // email (Clerk-id rotation for an existing agent). Nothing is created.
    const sessionEmail = await getClerkSessionEmail()
    const clerkData = await getClerkUserData(userId)
    const lookupEmail = clerkData.email ?? sessionEmail
    if (lookupEmail) {
      const { data: existingByEmail, error: emailLookupError } = await db
        .from('profiles')
        .select('*')
        .eq('email', lookupEmail)
        .maybeSingle()

      if (emailLookupError) {
        console.error('[profiles] email lookup failed', emailLookupError)
      }

      if (existingByEmail && canRelinkByEmail(existingByEmail, userId)) {
        const { data: linked, error: linkError } = await db
          .from('profiles')
          .update({ clerk_user_id: userId })
          .eq('id', existingByEmail.id)
          .select('*')
          .single()

        if (linkError) console.error('[profiles] relink by email failed', linkError)
        if (linked) return linked as Profile
      }
      if (existingByEmail && existingByEmail.clerk_user_id === userId) {
        return existingByEmail as Profile
      }
    }

    return null
  } catch (error) {
    console.error('[profiles] getOrCreateProfile recovery failed', error)
    return null
  }
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
  const { data: own } = await db
    .from('profiles')
    .select('id, role')
    .eq('clerk_user_id', userId)
    .maybeSingle()
  // Support access is granted by an admin only. This form just sets the
  // public agent identity of an existing staff row; it never assigns a role.
  const patch = own
    ? selfEditablePatch(own, { full_name: fullName, avatar_url: supportAvatarUrl(input.avatarSeed || fullName) })
    : null
  if (!own || !patch) throw new Error('Support access is granted by an administrator.')

  const { data } = await db
    .from('profiles')
    .update(patch)
    .eq('id', own.id)
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

async function requireAdminDb() {
  const userId = await getClerkUserId()
  if (!userId) return null
  const db = createSupabaseAdminClient()
  const { data: me } = await db.from('profiles').select('role').eq('clerk_user_id', userId).maybeSingle()
  return me?.role === 'admin' ? db : null
}

export async function getPendingSupportAgents(): Promise<Profile[]> {
  const db = await requireAdminDb()
  if (!db) return []
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
  const { data: own } = await db
    .from('profiles')
    .select('id, role')
    .eq('clerk_user_id', userId)
    .maybeSingle()
  const patch = own ? selfEditablePatch(own, updates) : null
  if (!own || !patch || Object.keys(patch).length === 0) return null

  const { data } = await db
    .from('profiles')
    .update(patch)
    .eq('id', own.id)
    .select('*')
    .single()

  return (data as Profile) ?? null
}

export async function getAllProfiles(): Promise<Profile[]> {
  const db = await requireAdminDb()
  if (!db) return []
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
