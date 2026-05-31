import { NextResponse } from 'next/server'
import { exportAuditLog, toCsv } from '@/lib/actions/support-audit-viewer'
import { SupportActionError } from '@/lib/actions/support-audit'

function buildFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `support-audit-${stamp}.csv`
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)

    const result = await exportAuditLog({
      actor: url.searchParams.get('actor'),
      action: url.searchParams.get('action'),
      target_type: url.searchParams.get('target_type'),
      dateFrom: url.searchParams.get('dateFrom'),
      dateTo: url.searchParams.get('dateTo'),
      q: url.searchParams.get('q'),
    })

    const csv = toCsv(result.rows)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${buildFilename()}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/audit/export GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
