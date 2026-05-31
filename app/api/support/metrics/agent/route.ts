import { NextResponse } from 'next/server'
import { getAgentMetrics, type MetricsRange } from '@/lib/actions/support-metrics'
import { SupportActionError } from '@/lib/actions/support-audit'

const VALID_RANGES: MetricsRange[] = ['today', '7d', '30d']

export async function GET(request: Request) {
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
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/metrics/agent GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
