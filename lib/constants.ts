// ============================================================
// Support-side constants. Hardcoded thresholds + tunables that
// security-relevant code reads. Never expose to the browser
// without a deliberate re-export — these are policy values.
// ============================================================

/**
 * Maximum refund (in cents) a `support` agent may execute without
 * admin co-sign. Above this, the action returns `requires_admin_co_sign`.
 * Reviewed: 2026-05-31. Source: phase 3 brief.
 */
export const SUPPORT_REFUND_CAP_CENTS = 50_000 // $500.00 USD

/**
 * Maximum wallet credit (cents) a `support` agent may issue without
 * admin co-sign. Phase 8 reads this; defined here for one-stop tuning.
 */
export const SUPPORT_WALLET_CREDIT_CAP_CENTS = 20_000 // $200.00 USD
