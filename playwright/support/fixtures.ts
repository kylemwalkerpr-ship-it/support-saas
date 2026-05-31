// ============================================================
// Playwright fixtures for the support smoke suite
// ============================================================
//
// These constants describe the data the smoke specs expect to
// find in the test environment. Seeding is OUT OF SCOPE for this
// phase — the specs are skipped by default (SKIP_SUPPORT_SMOKES=1)
// until a seeded test environment is wired up in CI.
//
// When you wire seeding, mirror these values exactly OR update
// the constants here and re-run the specs locally first.
//
// NOTE: this file intentionally has NO runtime imports. It is
// loaded by every spec and must work even if @playwright/test
// is not installed (the specs themselves do the import).
// ============================================================

export const SUPPORT_AGENT = {
  email: 'support.smoke@yousafe.local',
  password: process.env.SMOKE_SUPPORT_PASSWORD ?? 'change-me-in-ci',
  fullName: 'Support Smoke Agent',
} as const

export const ADMIN_AGENT = {
  email: 'admin.smoke@yousafe.local',
  password: process.env.SMOKE_ADMIN_PASSWORD ?? 'change-me-in-ci',
  fullName: 'Admin Smoke Agent',
} as const

export const SEEDED_USER = {
  // Used by signin-search-suspend.spec.ts
  email: 'test.user@example.com',
  fullName: 'Test User',
  searchQuery: 'test',
} as const

export const SEEDED_ORDER = {
  // Used by refund-partial.spec.ts
  // Must be a paid order with total >= $25 and a configured gateway.
  orderNumber: 'YS-SMOKE-1001',
  totalDollars: 100,
  partialRefundDollars: 25,
} as const

export const SEEDED_DISPUTE = {
  // Used by dispute-decide-refund.spec.ts
  // Must be `status = 'open'`, refund amount under the support cap.
  shortId: 'd-smoke-001',
  refundAmountDollars: 50,
} as const

export const SEEDED_VERIFICATION = {
  // Used by verification-approve.spec.ts
  // Must be `status = 'pending'` attorney application.
  applicationShortId: 'v-smoke-001',
  applicantEmail: 'attorney.smoke@example.com',
} as const

export const SEEDED_CONVERSATION = {
  // Used by macro-reply.spec.ts
  shortId: 'c-smoke-001',
  macroSlashCommand: '/welcome',
  // The macro itself must already exist with title 'Welcome'.
} as const

export const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export const SKIP =
  process.env.SKIP_SUPPORT_SMOKES === '1' ||
  process.env.SKIP_SUPPORT_SMOKES === 'true'
