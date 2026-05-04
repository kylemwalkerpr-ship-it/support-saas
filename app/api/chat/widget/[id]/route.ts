import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { estimateWaitMinutes } from '@/lib/chat/knowledge'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = createSupabaseAdminClient()

  const [{ data: conversation }, { data: messages }, { count }] = await Promise.all([
    db.from('chat_conversations').select('*').eq('id', id).single(),
    db
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true }),
    db
      .from('chat_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'waiting_for_agent'),
  ])

  const queuePosition = conversation?.status === 'waiting_for_agent' ? count || 1 : 0
  return NextResponse.json({
    conversation,
    messages: messages ?? [],
    queue: {
      position: queuePosition,
      estimatedWaitMinutes: queuePosition ? estimateWaitMinutes(queuePosition, 0) : 0,
    },
  })
}
