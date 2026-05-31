'use server'

import { getOrCreateProfile } from '@/lib/actions/profiles'
import {
  logSupportAction,
} from '@/lib/actions/support-audit'
import { SupportActionError } from '@/lib/errors'
import type { Profile, SupportAuditLogEntry } from '@/lib/types'

// ============================================================
// Phase 4 — support-side escrow release bridge
//
// Mirrors processRefund: a thin in-band call to the portal admin
// escrow endpoint via Bearer service-token auth, with audit + order
// row update on success.
//
// NOTE: at the time of Phase 4 ship, the portal endpoint
// /api/admin/escrow/[id]/release accepts ONLY Clerk admin sessions.
// The dual-auth (Bearer service token) pattern matches what the
// /refund endpoint already supports — see ../../../yousafe-portal/
// app/api/admin/escrow/[id]/refund/route.ts for the precedent. The
// portal-side mirror patch is tracked separately; until it ships,
// release/split decisions surface portal 401s as 502s here, which
// is the correct integrator-side behaviour.
// ============================================================

export interface ProcessEscrowReleaseInput {
  orderId: string
  amountCents: number
  reason: string
}

export interface ProcessEscrowReleaseResult {
  amountCents: number
  transactionId: string | null
  audit: SupportAuditLogEntry
}

const REASON_MIN = 20

async function requireSupportOrAdmin(): Promise<Profile> {
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

export async function processEscrowRelease(
  input: ProcessEscrowReleaseInput
): Promise<ProcessEscrowReleaseResult> {
  await requireSupportOrAdmin()
  const reason = (input.reason ?? '').trim()
  if (reason.length < REASON_MIN) {
    throw new SupportActionError(
      'invalid_input',
      `Reason must be at least ${REASON_MIN} characters`,
      400
    )
  }
  const amountCents = Math.floor(Number(input.amountCents))
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new SupportActionError(
      'invalid_input',
      'amountCents must be a positive integer',
      400
    )
  }

  const token = process.env.PORTAL_SERVICE_TOKEN
  if (!token) {
    throw new SupportActionError(
      'config_missing',
      'PORTAL_SERVICE_TOKEN is not configured; cannot dispatch escrow release',
      500
    )
  }

  let portalRes: Response
  try {
    portalRes = await fetch(
      `https://portal.yousafeconsultancy.com/api/admin/escrow/${encodeURIComponent(input.orderId)}/release`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amountCents,
          reason,
        }),
      }
    )
  } catch (err) {
    throw new SupportActionError(
      'gateway_unreachable',
      `Portal release endpoint unreachable: ${err instanceof Error ? err.message : 'unknown'}`,
      502
    )
  }

  const portalBody = (await portalRes.json().catch(() => ({}))) as {
    success?: boolean
    data?: { released_earnings?: number; order?: { id?: string } }
    error?: string
  }

  if (!portalRes.ok || portalBody.success === false) {
    throw new SupportActionError(
      'gateway_release_failed',
      portalBody.error ?? `Portal release failed (HTTP ${portalRes.status})`,
      portalRes.status >= 400 && portalRes.status < 600 ? portalRes.status : 502
    )
  }

  const transactionId =
    portalBody.data?.order?.id ?? null

  // The portal owns the orders.escrow_* / escrow_status columns and updates
  // them in the release handler. No local mirror needed.

  const audit = await logSupportAction({
    action: 'order.escrow_release',
    targetType: 'order',
    targetId: input.orderId,
    reason,
    metadata: {
      amountCents,
      transactionId,
    },
  })

  return { amountCents, transactionId, audit }
}
