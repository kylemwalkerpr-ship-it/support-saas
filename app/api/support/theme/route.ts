import { NextResponse } from 'next/server'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { THEME_IDS, type PortalThemeId } from '@/lib/portalThemes'

export async function GET() {
  const userId = await getClerkUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from('profiles')
    .select('theme_preference')
    .eq('clerk_user_id', userId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const theme = (data?.theme_preference as PortalThemeId) ?? 'mountain-view'
  return NextResponse.json({ theme })
}

export async function PATCH(request: Request) {
  const userId = await getClerkUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const theme = body.theme
  if (typeof theme !== 'string' || !THEME_IDS.includes(theme as PortalThemeId)) {
    return NextResponse.json({ error: 'Invalid theme' }, { status: 400 })
  }

  const db = createSupabaseAdminClient()
  const { error } = await db
    .from('profiles')
    .update({ theme_preference: theme })
    .eq('clerk_user_id', userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, theme })
}
