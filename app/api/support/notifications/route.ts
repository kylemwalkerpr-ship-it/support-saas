import { NextResponse } from 'next/server'
import {
  listNotifications,
  markRead,
  markAllRead,
} from '@/lib/actions/support-notifications'
import { getOrCreateProfile } from '@/lib/actions/profiles'
import { SupportActionError } from '@/lib/errors'

export async function GET(request: Request) {
  try {
    const me = await getOrCreateProfile()
    if (!me) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (me.role !== 'support' && me.role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const url = new URL(request.url)
    const statusRaw = url.searchParams.get('status')
    const status =
      statusRaw === 'all' ? 'all' : 'unread'
    const limitRaw = url.searchParams.get('limit')
    const limit = limitRaw ? Number(limitRaw) : undefined

    const result = await listNotifications({
      recipientId: me.id,
      status,
      limit: Number.isFinite(limit) ? limit : undefined,
    })

    return NextResponse.json(result, {
      // Bell polls every 30s; keep the response uncached so the count is fresh.
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/notifications GET] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

interface MarkBody {
  action?: string
  ids?: unknown
}

export async function POST(request: Request) {
  try {
    const me = await getOrCreateProfile()
    if (!me) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (me.role !== 'support' && me.role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const raw = (await request.json().catch(() => null)) as MarkBody | null
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
    }

    if (raw.action === 'mark_all_read') {
      const result = await markAllRead(me.id)
      return NextResponse.json(result)
    }

    if (raw.action === 'mark_read') {
      const ids = Array.isArray(raw.ids)
        ? raw.ids.filter((id): id is string => typeof id === 'string' && !!id)
        : []
      const result = await markRead({ recipientId: me.id, ids })
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'invalid_action' }, { status: 400 })
  } catch (error) {
    if (error instanceof SupportActionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus }
      )
    }
    console.error('[api/support/notifications POST] unexpected error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
