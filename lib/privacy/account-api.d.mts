export interface PrivacySession { sub: string; sid: string; exp: number }
export interface PrivacyMembership { subject: string; site: string; tenant: string; version?: number; status?: 'active' | 'suspended' | 'revoked'; issuance?: boolean; withdrawal?: boolean }
export interface ConsentState { epoch: number; state: 'active' | 'withdrawn'; scopes: string[]; disclosure: string }
export interface PrivacyStore {
  review(): Promise<ConsentState | null>
  transition(action: 'grant' | 'withdraw', epoch: number, scopes: string[]): Promise<number>
  reserve(claims: Record<string, unknown>): Promise<boolean>
}
export interface PrivacyDependencies {
  origin: string; site: string; tenant: string
  session(): Promise<PrivacySession | null>
  /** Fresh authoritative DB membership; null until schema/ownership approved. */
  membership(session: PrivacySession): Promise<PrivacyMembership | null>
  store(context: { session: PrivacySession; membership: PrivacyMembership }): PrivacyStore
  signing: { enabled: boolean; issuer?: string; audience?: string; site?: string; tenant?: string; kid?: string; privateJwk?: JsonWebKey }
}
export declare const PRIVACY_HEADERS: Readonly<Record<string, string>>
export declare function privacyResponse(body: unknown, status?: number): Response
export declare function validPostOrigin(request: Request, origin: string): boolean
export declare function readPrivacyJson(request: Request): Promise<unknown>
export declare function handleAccountPrivacy(request: Request, action: string, deps: PrivacyDependencies): Promise<Response>
