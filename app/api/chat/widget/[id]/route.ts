import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { estimateWaitMinutes } from '@/lib/chat/knowledge'
import { corsHeadersFor, handleWidgetGet, readVisitorToken } from '@/lib/chat/widgetAuth.mjs'

// Phase 5 CORS: YouSafe origins only (see lib/chat/widgetAuth.mjs); never a wildcard.
const METHODS = 'GET, OPTIONS'

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request, METHODS) })
}

// Only the visitor holding this conversation's token (X-Chat-Token, issued by
// POST /api/chat/widget) can read it. Staff use the authenticated support APIs.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const headers = { ...corsHeadersFor(request, METHODS), 'Cache-Control': 'no-store' }
  const result = await handleWidgetGet({
    db: createSupabaseAdminClient(),
    conversationId: id,
    token: readVisitorToken(request),
    estimateWaitMinutes,
  })
  return NextResponse.json(result.body, { status: result.status, headers })
}
