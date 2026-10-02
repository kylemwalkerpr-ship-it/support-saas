import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { webhookIdentityPatch } from '@/lib/support-profile-policy.mjs'

interface ClerkUserEvent {
  type: 'user.created' | 'user.updated' | 'user.deleted'
  data: {
    id: string
    email_addresses: Array<{ email_address: string; id: string }>
    primary_email_address_id: string
    first_name: string | null
    last_name: string | null
    image_url: string | null
  }
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) return new Response('Webhook secret not configured', { status: 500 })

  const headerPayload = await headers()
  const svixId = headerPayload.get('svix-id')
  const svixTimestamp = headerPayload.get('svix-timestamp')
  const svixSignature = headerPayload.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  const payload = await req.text()
  const wh = new Webhook(secret)

  let event: ClerkUserEvent
  try {
    event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkUserEvent
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  const db = createSupabaseAdminClient()
  const { data } = event

  // The profiles table is shared with the portal/marketplace (one Clerk
  // instance). This webhook only syncs identity fields on rows that already
  // exist; it never inserts a row and never writes role/status (see
  // lib/support-profile-policy.mjs, 2026-10-01 role regression).
  if (event.type === 'user.created' || event.type === 'user.updated') {
    const primaryEmail = data.email_addresses.find(
      (e) => e.id === data.primary_email_address_id
    )?.email_address ?? null
    const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ') || null

    const { data: existing } = await db
      .from('profiles')
      .select('id, email, full_name, avatar_url')
      .eq('clerk_user_id', data.id)
      .maybeSingle()

    const patch = webhookIdentityPatch(existing, {
      email: primaryEmail?.toLowerCase() ?? null,
      fullName,
      avatarUrl: data.image_url,
    })
    if (existing && patch) {
      const { error } = await db.from('profiles').update(patch).eq('id', existing.id)
      if (error) {
        console.error('[clerk-webhook] support profile identity sync failed', error)
        return new Response('Unable to sync profile identity', { status: 500 })
      }
    }
  }

  // user.deleted: the shared profile row (orders, wallet, ledger) is owned by
  // the portal, which detaches it; the support site never deletes it.

  return new Response('OK', { status: 200 })
}
