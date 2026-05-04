import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

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

  if (event.type === 'user.created' || event.type === 'user.updated') {
    const primaryEmail = data.email_addresses.find(
      (e) => e.id === data.primary_email_address_id
    )?.email_address

    if (!primaryEmail) return new Response('No primary email', { status: 400 })

    const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ') || null

    const profilePayload: Record<string, unknown> = {
        clerk_user_id: data.id,
        email: primaryEmail,
        full_name: fullName,
        avatar_url: data.image_url,
    }

    if (event.type === 'user.created') {
      profilePayload.role = 'client'
      profilePayload.status = 'active'
    }

    await db.from('profiles').upsert(
      profilePayload,
      { onConflict: 'clerk_user_id', ignoreDuplicates: false }
    )
  }

  if (event.type === 'user.deleted') {
    await db.from('profiles').delete().eq('clerk_user_id', data.id)
  }

  return new Response('OK', { status: 200 })
}
