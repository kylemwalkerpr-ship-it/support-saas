import { NextResponse } from 'next/server'
import { getTeamMetrics, type MetricsRange } from '@/lib/actions/support-metrics'
import { SupportActionError } from '@/lib/errors'

const VALID_RANGES: MetricsRange[] = ['today', '7d', '30d']

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const rangeRaw = url.searchParams.get('range')
    const range =
      rangeRaw && (VALID_RANGES as string[]).includes(rangeRaw)
        ? (rangeRaw as MetricsRange)
        : '7d'

    const result = await getTeamMetrics({ range })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/metrics/team GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
