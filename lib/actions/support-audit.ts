'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { SupportActionError } from '@/lib/errors'
import type { SupportAuditLogEntry, SupportActorRole } from '@/lib/types'

// `SupportActionError` now lives in `lib/errors.ts` so non-async
// exports stay out of `'use server'` files (Next 16+ enforces this).
// Phase 10 RBAC pass extracted it.

interface LogSupportActionInput {
  action: string
  targetType: string
  targetId: string
  reason?: string
  metadata?: Record<string, unknown>
}

function isSupportActorRole(role: string): role is SupportActorRole {
  return role === 'support' || role === 'admin'
}

/**
 * Records a support/admin action in the support_audit_log via the
 * SECURITY DEFINER RPC. Resolves the actor from the Clerk session through
 * the existing getOrCreateProfile() helper — do not duplicate auth here.
 *
 * Throws SupportActionError if there is no authenticated profile or the
 * caller is not in the support|admin role set.
 */
export async function logSupportAction(
  input: LogSupportActionInput
): Promise<SupportAuditLogEntry> {
  const profile = await getOrCreateProfile()

  if (!profile) {
    throw new SupportActionError('unauthorized', 'No authenticated profile', 401)
  }

  if (!isSupportActorRole(profile.role)) {
    throw new SupportActionError(
      'forbidden',
      `Role '${profile.role}' is not permitted to log support actions`,
      403
    )
  }

  const db = createSupabaseAdminClient()

  const { data, error } = await db.rpc('support_log_action', {
    actor_id: profile.id,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
  })

  if (error) {
    throw new SupportActionError(
      'audit_rpc_failed',
      `support_log_action RPC failed: ${error.message}`,
      500
    )
  }

  // Supabase rpc() returning a single row gives us the row object directly,
  // but client typings surface it as unknown — narrow defensively.
  const row = Array.isArray(data) ? (data[0] as unknown) : (data as unknown)

  if (!row || typeof row !== 'object') {
    throw new SupportActionError(
      'audit_rpc_empty',
      'support_log_action returned no row',
      500
    )
  }

  return row as SupportAuditLogEntry
}
