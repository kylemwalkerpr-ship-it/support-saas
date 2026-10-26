import type { PrivacySession, PrivacyMembership } from './account-api.mjs'
export declare function deploymentScope(env: Record<string, string | undefined>): { site: string; tenant: string } | null
export declare function lookupMembership(db: { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: any; error?: unknown }> }, scope: { site: string; tenant: string } | null, session: PrivacySession): Promise<PrivacyMembership | null>
