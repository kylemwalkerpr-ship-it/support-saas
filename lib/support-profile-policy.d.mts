export declare const STAFF_ROLES: readonly string[]
export declare function isStaffRole(role: unknown): boolean
export declare function isRecoveryEmail(email: string | null | undefined): boolean
export declare function identityBackfillPatch(
  existing: { email?: string | null; full_name?: string | null; avatar_url?: string | null },
  clerk: { email?: string | null; fullName?: string | null; avatarUrl?: string | null },
): Record<string, string>
export declare function canRelinkByEmail(row: { clerk_user_id?: string | null; role?: string | null }, clerkUserId: string): boolean
export declare function selfEditablePatch(own: { role?: string | null }, requested: Record<string, unknown>): Record<string, unknown> | null
export declare function webhookIdentityPatch(
  existing: { email?: string | null; full_name?: string | null; avatar_url?: string | null } | null,
  clerk: { email?: string | null; fullName?: string | null; avatarUrl?: string | null },
): Record<string, string> | null
