// @ts-check
/**
 * Support workspace profile policy.
 *
 * support.yousafeconsultancy.com shares ONE Clerk instance and ONE Supabase
 * `profiles` table with the portal and marketplace. A shared profile row is
 * owned by the portal: its `role` / `status` decide which portal dashboard a
 * person lands on. The support workspace must therefore NEVER change the role
 * or status of a row it did not provision.
 *
 * Regression (2026-10-01): getOrCreateProfile() rewrote every non-support
 * profile to role='support', status='pending' whenever its owner opened the
 * support site. A transacting student (7 orders) was turned into a pending
 * support agent and from then on the portal routed them to the support lane.
 *
 * Rules enforced here (pure functions, unit-tested in
 * tests/support-profile-policy.test.mjs):
 *  - Existing rows: only blank identity fields may be backfilled. Role and
 *    status are never part of the patch.
 *  - Support access is granted by an admin (updateUserRole / setSupportStatus).
 *    Nobody self-assigns `support` or `admin`; the support site never creates
 *    a profile row for an unknown Clerk user.
 *  - Relinking a row to a new Clerk id by email is only allowed for staff rows
 *    (admin/support); a customer or provider row is never relinked here.
 */

export const STAFF_ROLES = Object.freeze(['admin', 'support'])

/** @param {unknown} role */
export function isStaffRole(role) {
  return typeof role === 'string' && STAFF_ROLES.includes(role)
}

/** @param {string | null | undefined} email */
export function isRecoveryEmail(email) {
  return !!email && email.endsWith('@support.yousafe.local')
}

/**
 * Identity-only patch for an existing profile row. Never contains role/status.
 * @param {{ email?: string | null, full_name?: string | null, avatar_url?: string | null }} existing
 * @param {{ email?: string | null, fullName?: string | null, avatarUrl?: string | null }} clerk
 * @returns {Record<string, string>}
 */
export function identityBackfillPatch(existing, clerk) {
  /** @type {Record<string, string>} */
  const patch = {}
  if (clerk.email && (!existing.email || isRecoveryEmail(existing.email))) patch.email = clerk.email
  if (clerk.fullName && !existing.full_name) patch.full_name = clerk.fullName
  if (clerk.avatarUrl && !existing.avatar_url) patch.avatar_url = clerk.avatarUrl
  return patch
}

/**
 * May a row found by email be relinked to the signed-in Clerk id?
 * @param {{ clerk_user_id?: string | null, role?: string | null }} row
 * @param {string} clerkUserId
 */
export function canRelinkByEmail(row, clerkUserId) {
  return row.clerk_user_id !== clerkUserId && isStaffRole(row.role)
}

/**
 * Fields a signed-in user may change on their OWN row from the support site.
 * Role/status are stripped; only staff rows may be edited at all.
 * @param {{ role?: string | null }} own
 * @param {Record<string, unknown>} requested
 * @returns {Record<string, unknown> | null}
 */
export function selfEditablePatch(own, requested) {
  if (!isStaffRole(own.role)) return null
  /** @type {Record<string, unknown>} */
  const patch = {}
  for (const key of ['full_name', 'bio', 'avatar_url']) {
    if (key in requested) patch[key] = requested[key]
  }
  return patch
}

/**
 * Clerk webhook (user.created / user.updated): identity sync only, for rows
 * that already exist. Never inserts and never writes role/status.
 * @param {{ email?: string | null, full_name?: string | null, avatar_url?: string | null } | null} existing
 * @param {{ email?: string | null, fullName?: string | null, avatarUrl?: string | null }} clerk
 * @returns {Record<string, string> | null}
 */
export function webhookIdentityPatch(existing, clerk) {
  if (!existing) return null
  const patch = identityBackfillPatch(existing, clerk)
  return Object.keys(patch).length > 0 ? patch : null
}
