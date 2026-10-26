import type { PrivacyMembership, PrivacySession, PrivacyStore } from './account-api.mjs'
export declare function createPrivacyStore(db: {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error?: unknown }>
}, context: { session: PrivacySession; membership: PrivacyMembership }): PrivacyStore
