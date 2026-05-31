'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { SupportActionError } from '@/lib/errors'
import type { Profile, SupportNotification } from '@/lib/types'

// ============================================================
// Phase 9 — Support notifications: list / mark-read / unread count
//
// Reads/writes against the support_notifications table from migration 008.
// All operations are scoped to the calling profile — a caller can only ever
// touch their own notifications. RLS enforces the same invariant; this layer
// just gives the API surface a typed home.
// ============================================================

export interface ListNotificationsInput {
  recipientId: string
  status?: 'unread' | 'all'
  limit?: number
}

export interface ListNotificationsResult {
  rows: SupportNotification[]
  unreadCount: number
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)))
}

async function requireProfile(): Promise<Profile> {
  const profile = await getOrCreateProfile()
  if (!profile) {
    throw new SupportActionError('unauthorized', 'No authenticated profile', 401)
  }
  if (profile.role !== 'support' && profile.role !== 'admin') {
    throw new SupportActionError(
      'forbidden',
      `Role '${profile.role}' is not permitted on this surface`,
      403
    )
  }
  return profile
}

function assertSelf(profile: Profile, recipientId: string): void {
  if (profile.id !== recipientId) {
    throw new SupportActionError(
      'forbidden',
      'Notifications can only be read or modified by the recipient',
      403
    )
  }
}

export async function listNotifications(
  input: ListNotificationsInput
): Promise<ListNotificationsResult> {
  const me = await requireProfile()
  assertSelf(me, input.recipientId)

  const db = createSupabaseAdminClient()
  const status = input.status ?? 'unread'
  const limit = clampLimit(input.limit)

  let qb = db
    .from('support_notifications')
    .select('*')
    .eq('recipient_id', me.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status === 'unread') qb = qb.is('read_at', null)

  const { data, error } = await qb
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to list notifications: ${error.message}`,
      500
    )
  }

  const { count, error: countErr } = await db
    .from('support_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', me.id)
    .is('read_at', null)
  if (countErr) {
    console.warn('[support-notifications] unread count failed', countErr)
  }

  return {
    rows: (data ?? []) as SupportNotification[],
    unreadCount: count ?? 0,
  }
}

export async function getUnreadCount(recipientId: string): Promise<number> {
  const me = await requireProfile()
  assertSelf(me, recipientId)
  const db = createSupabaseAdminClient()
  const { count, error } = await db
    .from('support_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', me.id)
    .is('read_at', null)
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to count notifications: ${error.message}`,
      500
    )
  }
  return count ?? 0
}

export interface MarkReadInput {
  recipientId: string
  ids: string[]
}

export async function markRead(input: MarkReadInput): Promise<{ updated: number }> {
  const me = await requireProfile()
  assertSelf(me, input.recipientId)

  const ids = (input.ids ?? []).filter((id): id is string => typeof id === 'string' && !!id)
  if (ids.length === 0) return { updated: 0 }

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from('support_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', me.id)
    .in('id', ids)
    .is('read_at', null)
    .select('id')
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to mark notifications read: ${error.message}`,
      500
    )
  }
  return { updated: (data ?? []).length }
}

export async function markAllRead(recipientId: string): Promise<{ updated: number }> {
  const me = await requireProfile()
  assertSelf(me, recipientId)

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from('support_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', me.id)
    .is('read_at', null)
    .select('id')
  if (error) {
    throw new SupportActionError(
      'db_error',
      `Failed to mark all notifications read: ${error.message}`,
      500
    )
  }
  return { updated: (data ?? []).length }
}

// ============================================================
// fanOutToSupportAgents — utility used by Phase 4/7 wiring
//
// Posts one support_notifications row per active support|admin profile.
// Recipients receive an in-app notification only; downstream email/Slack
// fan-out (Phase 10 follow-up) can hang off the same insert.
// ============================================================

export interface FanOutInput {
  type: string
  subjectType: string
  subjectId: string
  title: string
  body: string
  excludeProfileId?: string | null
}

export async function fanOutToSupportAgents(input: FanOutInput): Promise<void> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from('profiles')
    .select('id')
    .in('role', ['support', 'admin'])
    .eq('status', 'active')
  if (error) {
    console.warn('[support-notifications] fan-out lookup failed', error)
    return
  }
  for (const row of ((data ?? []) as Array<{ id: string }>)) {
    if (input.excludeProfileId && row.id === input.excludeProfileId) continue
    const { error: notifyErr } = await db.rpc('support_notify', {
      recipient_id: row.id,
      type: input.type,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      title: input.title,
      body: input.body,
    })
    if (notifyErr) {
      // Soft-fail per recipient — never block the originating action because
      // one notification insert failed.
      console.warn('[support-notifications] notify failed', row.id, notifyErr)
    }
  }
}
