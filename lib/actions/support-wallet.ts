'use server'

import { getOrCreateProfile } from '@/lib/actions/profiles'
import {
  logSupportAction,
} from '@/lib/actions/support-audit'
import { SupportActionError } from '@/lib/errors'
import { SUPPORT_WALLET_CREDIT_CAP_CENTS } from '@/lib/constants'
import { can } from '@/lib/rbac'
import type { Profile, SupportAuditLogEntry } from '@/lib/types'

// ============================================================
// Phase 8 — Wallet credit (support-initiated gift / apology credit)
//
// Mirrors the Phase 3 refund pattern: call the portal admin endpoint via
// Bearer service-token auth. The portal owns the wallet ledger and the
// `credit()` helper that we want to invoke server-to-server.
//
// Portal endpoint (see PR report for the spec — Claude will add it):
//   POST /api/admin/wallet/credit/[profileId]
//     headers: Authorization: Bearer ${PORTAL_SERVICE_TOKEN}
//     body:    { amountCents, memo, reason }
//     200:     { ok: true, transactionId, balanceCents }
//
// RBAC: support agents are capped at SUPPORT_WALLET_CREDIT_CAP_CENTS without
// admin co-sign; admins are unrestricted. Threshold is checked saas-side so
// the audit row reflects the policy decision before the portal call runs.
// ============================================================

const PORTAL_BASE_URL =
  process.env.PORTAL_BASE_URL ?? 'https://portal.yousafeconsultancy.com'

const MEMO_MIN = 8
const MEMO_MAX = 280
const REASON_MIN = 12
const REASON_MAX = 2000

export interface IssueWalletCreditInput {
  profileId: string
  amountCents: number
  memo: string
  reason: string
}

export interface IssueWalletCreditResult {
  transactionId: string | null
  balanceCents: number | null
  amountCents: number
  audit: SupportAuditLogEntry
}

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

function validateAmount(raw: number): number {
  const amountCents = Math.floor(Number(raw))
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new SupportActionError(
      'invalid_input',
      'amountCents must be a positive integer',
      400
    )
  }
  return amountCents
}

function validateMemo(raw: string): string {
  const trimmed = (raw ?? '').trim()
  if (trimmed.length < MEMO_MIN) {
    throw new SupportActionError(
      'invalid_input',
      `memo must be at least ${MEMO_MIN} characters`,
      400
    )
  }
  return trimmed.slice(0, MEMO_MAX)
}

function validateReason(raw: string): string {
  const trimmed = (raw ?? '').trim()
  if (trimmed.length < REASON_MIN) {
    throw new SupportActionError(
      'invalid_input',
      `reason must be at least ${REASON_MIN} characters`,
      400
    )
  }
  return trimmed.slice(0, REASON_MAX)
}

interface PortalCreditResponse {
  ok?: boolean
  transactionId?: string | null
  balanceCents?: number | null
  error?: string
}

/**
 * Issue a wallet credit on behalf of the support agent.
 *
 * Calls the portal `/api/admin/wallet/credit/[profileId]` endpoint with
 * service-token auth. Writes a `wallet.credit` audit entry. Throws
 * `SupportActionError('requires_admin_co_sign', …)` when a support agent
 * tries to issue a credit above the cap.
 */
export async function issueWalletCredit(
  input: IssueWalletCreditInput
): Promise<IssueWalletCreditResult> {
  const actor = await requireSupportOrAdmin()

  if (!input.profileId || typeof input.profileId !== 'string') {
    throw new SupportActionError('invalid_input', 'profileId is required', 400)
  }
  const amountCents = validateAmount(input.amountCents)
  const memo = validateMemo(input.memo)
  const reason = validateReason(input.reason)

  // Centralised via rbac.can() — same domain-specific
  // `requires_admin_co_sign` semantic as order.refund.
  if (!can(actor.role, 'wallet.credit', { amountCents })) {
    throw new SupportActionError(
      'requires_admin_co_sign',
      `Wallet credits above ${SUPPORT_WALLET_CREDIT_CAP_CENTS}¢ require admin co-sign`,
      402
    )
  }

  const token = process.env.PORTAL_SERVICE_TOKEN
  if (!token) {
    throw new SupportActionError(
      'config_missing',
      'PORTAL_SERVICE_TOKEN is not configured; cannot issue wallet credit',
      500
    )
  }

  let portalRes: Response
  try {
    portalRes = await fetch(
      `${PORTAL_BASE_URL}/api/admin/wallet/credit/${encodeURIComponent(input.profileId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amountCents, memo, reason }),
      }
    )
  } catch (err) {
    throw new SupportActionError(
      'gateway_unreachable',
      `Portal credit endpoint unreachable: ${err instanceof Error ? err.message : 'unknown'}`,
      502
    )
  }

  const portalBody = (await portalRes.json().catch(() => ({}))) as PortalCreditResponse

  if (!portalRes.ok || portalBody.ok === false) {
    throw new SupportActionError(
      'wallet_credit_failed',
      portalBody.error ?? `Portal credit failed (HTTP ${portalRes.status})`,
      portalRes.status >= 400 && portalRes.status < 600 ? portalRes.status : 502
    )
  }

  const transactionId = portalBody.transactionId ?? null
  const balanceCents =
    typeof portalBody.balanceCents === 'number' ? portalBody.balanceCents : null

  const audit = await logSupportAction({
    action: 'wallet.credit',
    targetType: 'profile',
    targetId: input.profileId,
    reason,
    metadata: {
      amountCents,
      memo,
      transactionId,
      balanceCents,
    },
  })

  return { transactionId, balanceCents, amountCents, audit }
}
