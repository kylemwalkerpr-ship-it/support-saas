import { NextResponse } from 'next/server'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'
import { searchOrders } from '@/lib/actions/support-orders'
import { SupportActionError } from '@/lib/errors'

function parseList(values: string[]): string[] {
  const out: string[] = []
  for (const raw of values) {
    for (const piece of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
      out.push(piece)
    }
  }
  return out
}

function parseNumber(raw: string | null): number | undefined {
  if (raw == null) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

function parseLimit(raw: string | null): number | undefined {
  if (!raw) return undefined
  const n = Number(raw)
  if (!Number.isFinite(n)) return undefined
  return Math.min(100, Math.max(1, Math.floor(n)))
}

export async function GET(request: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (request.signal.aborted) {
    return NextResponse.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  request.signal.addEventListener('abort', abortHandler)

  try {
    const url = new URL(request.url)
    const sp = url.searchParams

    const status = parseList(sp.getAll('status'))
    const gateway = parseList(sp.getAll('gateway'))
    const amountMin = parseNumber(sp.get('amountMin'))
    const amountMax = parseNumber(sp.get('amountMax'))
    const dateFrom = sp.get('dateFrom') || undefined
    const dateTo = sp.get('dateTo') || undefined
    const hasOpenDispute = sp.get('hasOpenDispute') === '1' || sp.get('hasOpenDispute') === 'true'
    const cursor = sp.get('cursor')
    const limit = parseLimit(sp.get('limit'))

    const result = await searchOrders({
      status: status.length > 0 ? status : undefined,
      gateway: gateway.length > 0 ? gateway : undefined,
      amountMin,
      amountMax,
      dateFrom,
      dateTo,
      hasOpenDispute: hasOpenDispute || undefined,
      cursor: cursor ?? undefined,
      limit,
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
    console.error('[api/support/orders] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  } finally {
    request.signal.removeEventListener('abort', abortHandler)
  }
}
