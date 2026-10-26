import { handleVisitorPrivacy, visitorPrivacyOptions } from '@/lib/privacy/visitor-api.mjs'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return handleVisitorPrivacy(request, id, createSupabaseAdminClient)
}

export function OPTIONS(request: Request) {
  return visitorPrivacyOptions(request)
}
