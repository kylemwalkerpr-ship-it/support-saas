import { NextResponse } from 'next/server'
import { getSupportDashboardData } from '@/lib/actions/chat'

export async function GET() {
  try {
    return NextResponse.json(await getSupportDashboardData())
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load chat data' },
      { status: 401 }
    )
  }
}
