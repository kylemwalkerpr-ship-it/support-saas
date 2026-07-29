import { NextResponse } from 'next/server'
import { getAgentMetrics, type MetricsRange } from '@/lib/actions/support-metrics'
import { SupportActionError } from '@/lib/errors'

const VALID_RANGES: MetricsRange[] = ['today', '7d', '30d']

export async function GET(request: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (request.signal.aborted) {
    return NextResponse.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  request.signal.addEventListener('abort', abortHandler)

  try {
    const url = new URL(request.url)
    const rangeRaw = url.searchParams.get('range')
    const range =
      rangeRaw && (VALID_RANGES as string[]).includes(rangeRaw)
        ? (rangeRaw as MetricsRange)
        : '7d'
    const profileId = url.searchParams.get('profileId') ?? undefined

    const result = await getAgentMetrics({ profileId, range })
    return NextResponse.json(result)
  } catch (error) {
    // CPU timeout detection (Cloudflare kills workers mid-flight)
    const message = error instanceof Error ? error.message : String(error)
    const isCpuTimeout = /CPU|timeout|abort|budget|exceeded|terminated/i.test(message)
    if (isCpuTimeout) {
      return NextResponse.json({ error: message }, { status: 503 })
    }
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/metrics/agent GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  } finally {
    request.signal.removeEventListener('abort', abortHandler)
  }
}
