import { cache } from 'react'
import { cookies } from 'next/headers'
import { verifyToken } from '@clerk/nextjs/server'
import {
  emailFromClaims,
  readSessionToken,
  verifyOptionsFromEnv,
  verifySessionClaims,
} from '@/lib/clerk-session.mjs'

// Verified Clerk session claims for server components, server actions and
// route handlers. The `__session` JWT's signature, exp/nbf/iat and authorized
// party are verified with Clerk's own verifier before any claim is trusted
// (networkless with CLERK_JWT_KEY; otherwise the instance JWKS via
// CLERK_SECRET_KEY, cached in-isolate). An unsigned/forged/expired token yields
// null. Memoized per request so one request pays for at most one RS256 verify.
const getVerifiedSessionClaims = cache(async (): Promise<Record<string, unknown> | null> => {
  const cookieStore = await cookies()
  const token = readSessionToken((name) => cookieStore.get(name)?.value)
  if (!token) return null
  return verifySessionClaims(token, {
    verifyToken: verifyToken as unknown as (token: string, options: object) => Promise<unknown>,
    options: verifyOptionsFromEnv(process.env as Record<string, string | undefined>),
  })
})

export async function getClerkUserId(): Promise<string | null> {
  const claims = await getVerifiedSessionClaims()
  return typeof claims?.sub === 'string' ? claims.sub : null
}

export async function getClerkSessionEmail(): Promise<string | null> {
  return emailFromClaims(await getVerifiedSessionClaims())
}
