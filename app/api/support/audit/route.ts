import { NextResponse } from 'next/server'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'
import { searchAuditLog } from '@/lib/actions/support-audit-viewer'
import { SupportActionError } from '@/lib/errors'

export async function GET(request: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (request.signal.aborted) {
    return NextResponse.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  request.signal.addEventListener('abort', abortHandler)

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
    // CPU timeout detection (Cloudflare kills workers mid-flight)
    const message = error instanceof Error ? error.message : String(error)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    if (isCpuTimeout) {
      return NextResponse.json({ error: message }, { status: 503 })
    }
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/audit GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  } finally {
    request.signal.removeEventListener('abort', abortHandler)
  }
}
