import { NextResponse } from 'next/server'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'
import {
  searchInbox,
  type SearchInboxInput,
} from '@/lib/actions/support-inbox'
import { SupportActionError } from '@/lib/errors'
import type { InboxStatus, InboxChannel } from '@/lib/types'

const VALID_STATUSES: InboxStatus[] = ['open', 'snoozed', 'resolved']
const VALID_CHANNELS: InboxChannel[] = ['widget', 'email', 'in_app']
const VALID_ASSIGNMENTS = ['mine', 'unassigned', 'all'] as const

function parseStatusList(values: string[]): InboxStatus[] {
  const out: InboxStatus[] = []
  for (const raw of values) {
    for (const piece of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
      if ((VALID_STATUSES as string[]).includes(piece)) {
        out.push(piece as InboxStatus)
      }
    }
  }
  return out
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
    const statusList = parseStatusList(url.searchParams.getAll('status'))
    const assignmentRaw = url.searchParams.get('assignment')
    const assignment = assignmentRaw &&
      (VALID_ASSIGNMENTS as readonly string[]).includes(assignmentRaw)
        ? (assignmentRaw as SearchInboxInput['assignment'])
        : 'all'
    const channelRaw = url.searchParams.get('channel')
    const channel = channelRaw && (VALID_CHANNELS as string[]).includes(channelRaw)
      ? (channelRaw as InboxChannel)
      : null
    const cursor = url.searchParams.get('cursor')
    const limitRaw = url.searchParams.get('limit')
    const limit = limitRaw ? Number(limitRaw) : undefined

    const result = await searchInbox({
      status: statusList.length ? statusList : undefined,
      assignment,
      channel,
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
    console.error('[api/support/inbox GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  } finally {
    request.signal.removeEventListener('abort', abortHandler)
  }
}
