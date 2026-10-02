export declare const SESSION_COOKIE: '__session'
export declare function readSessionToken(getCookie: (name: string) => string | undefined): string | null
export declare function parseAuthorizedParties(value: unknown): string[] | undefined
export interface SessionVerifyOptions {
  jwtKey?: string
  secretKey?: string
  authorizedParties?: string[]
  clockSkewInMs: number
}
export declare function verifyOptionsFromEnv(env: Record<string, string | undefined>): SessionVerifyOptions | null
export declare function peekTokenHeader(token: string): Record<string, unknown> | null
export declare const UNKNOWN_KID_WINDOW_MS: number
export interface KidGuard {
  known: Set<string>
  lastUnknownAttemptAt: number
}
export declare function createKidGuard(): KidGuard
export declare function verifySessionClaims(
  token: string | null,
  deps: {
    verifyToken: (token: string, options: SessionVerifyOptions) => Promise<unknown>
    options: SessionVerifyOptions | null
    kidGuard?: KidGuard
    now?: () => number
  },
): Promise<Record<string, unknown> | null>
export declare function emailFromClaims(claims: Record<string, unknown> | null | undefined): string | null
