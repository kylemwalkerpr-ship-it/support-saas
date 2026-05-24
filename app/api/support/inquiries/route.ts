import { NextResponse } from 'next/server'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const userId = await getClerkUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'all'
  const archived = searchParams.get('archived') || 'all'
  const q = searchParams.get('q')?.trim() || ''
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('page_size') || 50)))

  const db = createSupabaseAdminClient()

  const { data: profile } = await db
    .from('profiles')
    .select('role, status')
    .eq('clerk_user_id', userId)
    .maybeSingle()

  if (!profile || !['admin', 'support'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let qb = db
    .from('inquiries')
    .select(
      'id, email, full_name, phone, country, case_type, case_type_label, urgency, recommended_tier, answers, status, source, target_attorney_profile_id, claimed_by_attorney_id, client_profile_id, created_at, updated_at, archived_at, archived_by_role, archived_reason',
      { count: 'exact' }
    )
    .neq('source', 'portal_attorney_chat')
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (status !== 'all') qb = qb.eq('status', status)
  if (archived === 'yes') qb = qb.not('archived_at', 'is', null)
  if (archived === 'no') qb = qb.is('archived_at', null)
  if (q) qb = qb.or(`case_type_label.ilike.%${q}%,country.ilike.%${q}%,full_name.ilike.%${q}%`)

  const { data: inquiries, error, count } = await qb
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const inquiryIds = (inquiries ?? []).map((i) => i.id)
  let ordersMap: Record<string, { id: string; order_number: string }> = {}
  if (inquiryIds.length > 0) {
    const { data: orders } = await db
      .from('orders')
      .select('id, order_number, source_inquiry_id')
      .in('source_inquiry_id', inquiryIds)
    for (const o of orders ?? []) {
      if (o.source_inquiry_id) {
        ordersMap[o.source_inquiry_id] = { id: o.id, order_number: o.order_number }
      }
    }
  }

  const enriched = (inquiries ?? []).map((i) => ({
    ...i,
    order: ordersMap[i.id] || null,
  }))

  const total = count ?? 0

  return NextResponse.json({
    inquiries: enriched,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    has_more: page * pageSize < total,
  })
}
