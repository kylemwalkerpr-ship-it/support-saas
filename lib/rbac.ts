// ============================================================
// Unified RBAC layer — Phase 10
// ============================================================
//
// Centralises every authorisation decision the support surface
// makes. Each support action calls `requireCan(profile, action, ctx)`
// at its top so the matrix lives in one place.
//
// Action strings are derived from the actual call sites in
// `lib/actions/support-*.ts`. The matrix in `lib/rbac.matrix.md`
// must match the table below row-for-row.
//
// IMPORTANT: this is policy code. Changes here have direct
// security impact — pair with the matrix doc and the brief.
// ============================================================

import {
  SUPPORT_REFUND_CAP_CENTS,
  SUPPORT_WALLET_CREDIT_CAP_CENTS,
} from '@/lib/constants'
import { SupportActionError } from '@/lib/errors'
import type { Profile, Role } from '@/lib/types'

// ------------------------------------------------------------
// Action catalog. Edit lib/rbac.matrix.md whenever this list
// changes — the matrix doc and this union must stay aligned.
// ------------------------------------------------------------

export type Action =
  // user directory
  | 'user.search'
  | 'user.read'
  | 'user.suspend'
  | 'user.reactivate'
  | 'user.change_role'
  | 'user.add_note'
  // orders
  | 'order.search'
  | 'order.read'
  | 'order.extend_deadline'
  | 'order.force_cancel'
  | 'order.send_message'
  | 'order.refund'
  // disputes
  | 'dispute.search'
  | 'dispute.read'
  | 'dispute.open'
  | 'dispute.decide'
  | 'dispute.cosign'
  // escrow (via portal)
  | 'escrow.release'
  // inbox
  | 'inbox.search'
  | 'inbox.read'
  | 'inbox.take'
  | 'inbox.release'
  | 'inbox.assign'
  | 'inbox.set_status'
  | 'inbox.send_message'
  // macros
  | 'macro.list'
  | 'macro.read'
  | 'macro.create_personal'
  | 'macro.create_team_wide'
  | 'macro.update_personal'
  | 'macro.update_team_wide'
  | 'macro.delete_personal'
  | 'macro.delete_team_wide'
  // verifications
  | 'verification.search'
  | 'verification.read'
  | 'verification.approve'
  | 'verification.request_changes'
  | 'verification.reject'
  | 'verification.bulk_assign'
  // moderation
  | 'moderation.search'
  | 'moderation.read'
  | 'moderation.dismiss'
  | 'moderation.hide'
  | 'moderation.warn'
  | 'moderation.suspend'
  | 'moderation.create_system_flag'
  // wallet
  | 'wallet.credit'
  // direct email
  | 'email.send_to_user'
  // audit
  | 'audit.search'
  | 'audit.export'
  // metrics
  | 'metrics.read_mine'
  | 'metrics.read_team'
  // notifications
  | 'notification.read'
  | 'notification.mark_read'

export interface CanContext {
  /** target user's role — for user.suspend / user.reactivate / user.change_role */
  targetRole?: Role
  /** amount in cents — for order.refund and wallet.credit threshold checks */
  amountCents?: number
  /** macro owner — for macro.update_personal / macro.delete_personal */
  ownerId?: string
  /** acting profile id — for ownership checks */
  actorId?: string
}

// ------------------------------------------------------------
// Threshold helpers — single source of truth for $ caps.
// ------------------------------------------------------------

function withinRefundCap(amountCents: number | undefined): boolean {
  if (amountCents === undefined || amountCents === null) return true
  return amountCents <= SUPPORT_REFUND_CAP_CENTS
}

function withinWalletCap(amountCents: number | undefined): boolean {
  if (amountCents === undefined || amountCents === null) return true
  return amountCents <= SUPPORT_WALLET_CREDIT_CAP_CENTS
}

// ------------------------------------------------------------
// can(role, action, ctx) — returns true if permitted.
// ------------------------------------------------------------

export function can(role: Role, action: Action, ctx: CanContext = {}): boolean {
  // client / consultant never have any support-surface permissions.
  if (role !== 'support' && role !== 'admin') return false

  const isAdmin = role === 'admin'

  switch (action) {
    // ----- user directory -----
    case 'user.search':
    case 'user.read':
    case 'user.add_note':
      return true

    case 'user.suspend':
    case 'user.reactivate':
      // support cannot touch support/admin accounts.
      if (isAdmin) return true
      return ctx.targetRole !== 'support' && ctx.targetRole !== 'admin'

    case 'user.change_role':
      return isAdmin

    // ----- orders -----
    case 'order.search':
    case 'order.read':
    case 'order.extend_deadline':
    case 'order.force_cancel':
    case 'order.send_message':
      return true

    case 'order.refund':
      // support is capped at SUPPORT_REFUND_CAP_CENTS, admin unlimited.
      if (isAdmin) return true
      return withinRefundCap(ctx.amountCents)

    // ----- disputes -----
    case 'dispute.search':
    case 'dispute.read':
    case 'dispute.open':
      return true

    case 'dispute.decide':
      // support may propose; over-cap routes through co-sign at the
      // action layer, but support is allowed to call `decideDispute`.
      // Refund-cap enforcement happens in the action (it converts a
      // would-be unilateral large refund into a co-sign request).
      return true

    case 'dispute.cosign':
      return isAdmin

    // ----- escrow (via portal) -----
    case 'escrow.release':
      return true

    // ----- inbox -----
    case 'inbox.search':
    case 'inbox.read':
    case 'inbox.take':
    case 'inbox.release':
    case 'inbox.assign':
    case 'inbox.set_status':
    case 'inbox.send_message':
      return true

    // ----- macros -----
    case 'macro.list':
    case 'macro.read':
    case 'macro.create_personal':
      return true

    case 'macro.create_team_wide':
      return isAdmin

    case 'macro.update_personal':
    case 'macro.delete_personal':
      if (isAdmin) return true
      // support can only modify their own macro.
      if (!ctx.ownerId || !ctx.actorId) return false
      return ctx.ownerId === ctx.actorId

    case 'macro.update_team_wide':
    case 'macro.delete_team_wide':
      return isAdmin

    // ----- verifications -----
    case 'verification.search':
    case 'verification.read':
    case 'verification.approve':
    case 'verification.request_changes':
    case 'verification.reject':
    case 'verification.bulk_assign':
      return true

    // ----- moderation -----
    case 'moderation.search':
    case 'moderation.read':
    case 'moderation.dismiss':
    case 'moderation.hide':
    case 'moderation.warn':
    case 'moderation.suspend':
      return true

    case 'moderation.create_system_flag':
      return isAdmin

    // ----- wallet -----
    case 'wallet.credit':
      if (isAdmin) return true
      return withinWalletCap(ctx.amountCents)

    // ----- direct email -----
    case 'email.send_to_user':
      return true

    // ----- audit -----
    case 'audit.search':
      return true

    case 'audit.export':
      return isAdmin

    // ----- metrics -----
    case 'metrics.read_mine':
      return true

    case 'metrics.read_team':
      return isAdmin

    // ----- notifications -----
    case 'notification.read':
    case 'notification.mark_read':
      return true

    default: {
      // Exhaustiveness guard. If you add a new Action, TypeScript
      // will flag the missing case here.
      const _exhaustive: never = action
      void _exhaustive
      return false
    }
  }
}

// ------------------------------------------------------------
// requireCan — throws SupportActionError('forbidden', ..., 403)
// when can() returns false. Use this at the top of every
// mutating server action.
// ------------------------------------------------------------

/**
 * Build a human-readable message for a denied action. Special-cases
 * the threshold checks so the dialog can surface the right reason.
 */
function denyMessage(action: Action, ctx: CanContext): string {
  if (
    action === 'order.refund' &&
    typeof ctx.amountCents === 'number' &&
    ctx.amountCents > SUPPORT_REFUND_CAP_CENTS
  ) {
    return `Refunds above ${SUPPORT_REFUND_CAP_CENTS}¢ require admin co-sign`
  }
  if (
    action === 'wallet.credit' &&
    typeof ctx.amountCents === 'number' &&
    ctx.amountCents > SUPPORT_WALLET_CREDIT_CAP_CENTS
  ) {
    return `Wallet credits above ${SUPPORT_WALLET_CREDIT_CAP_CENTS}¢ require admin co-sign`
  }
  if (action === 'user.suspend' || action === 'user.reactivate') {
    return 'Support agents cannot modify other support or admin accounts'
  }
  if (
    action === 'macro.update_personal' ||
    action === 'macro.delete_personal'
  ) {
    return 'Cannot modify a macro you do not own'
  }
  return `Action '${action}' is not permitted for this role`
}

export function requireCan(
  profile: Profile | null | undefined,
  action: Action,
  ctx: CanContext = {}
): asserts profile is Profile {
  if (!profile) {
    throw new SupportActionError(
      'unauthorized',
      'No authenticated profile',
      401
    )
  }
  if (!can(profile.role, action, { ...ctx, actorId: ctx.actorId ?? profile.id })) {
    throw new SupportActionError('forbidden', denyMessage(action, ctx), 403)
  }
}

// ------------------------------------------------------------
// Helpers re-exported so action files don't need a second import.
// ------------------------------------------------------------

export { SUPPORT_REFUND_CAP_CENTS, SUPPORT_WALLET_CREDIT_CAP_CENTS }
