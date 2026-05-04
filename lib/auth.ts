import { cookies } from 'next/headers'

// Decodes the Clerk session JWT to extract the user ID without making
// any network calls — compatible with Cloudflare Workers Edge runtime.
// Security: the JWT origin is validated by Clerk's middleware; here we only
// need the sub claim to look up the profile in Supabase.
async function getClerkSessionPayload(): Promise<Record<string, unknown> | null> {
  const cookieStore = await cookies()
  const token =
    cookieStore.get('__session')?.value ??
    cookieStore.get('__clerk_db_jwt')?.value

  if (!token) return null

  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const pad = parts[1].length % 4
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad ? 4 - pad : 0)
    return JSON.parse(atob(b64)) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function getClerkUserId(): Promise<string | null> {
  const payload = await getClerkSessionPayload()
  return typeof payload?.sub === 'string' ? payload.sub : null
}

export async function getClerkSessionEmail(): Promise<string | null> {
  const payload = await getClerkSessionPayload()
  const email =
    payload?.email ??
    payload?.primary_email ??
    payload?.email_address ??
    payload?.['https://clerk.com/email']

  return typeof email === 'string' && email.includes('@') ? email.toLowerCase() : null
}
