import { NextResponse } from 'next/server'
import { searchAuditLog } from '@/lib/actions/support-audit-viewer'
import { SupportActionError } from '@/lib/errors'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const limitRaw = url.searchParams.get('limit')
    const limit = limitRaw ? Number(limitRaw) : undefined

    const result = await searchAuditLog({
      actor: url.searchParams.get('actor'),
      action: url.searchParams.get('action'),
      target_type: url.searchParams.get('target_type'),
      dateFrom: url.searchParams.get('dateFrom'),
      dateTo: url.searchParams.get('dateTo'),
      q: url.searchParams.get('q'),
      cursor: url.searchParams.get('cursor'),
      limit: Number.isFinite(limit) ? limit : undefined,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/audit GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
