import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import { getAccessibleDeckIds, getBasicStats, getDetailedStats } from '@/lib/stats/calculations'

// GET /api/student/stats - Get student dashboard statistics
// Optional query params: ?detailed=true&days=30
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const searchParams = request.nextUrl.searchParams
    const detailed = searchParams.get('detailed') === 'true'
    const days = parseInt(searchParams.get('days') || '30', 10)

    // Get today's start (4 AM)
    const today = new Date()
    today.setHours(4, 0, 0, 0)
    if (new Date().getHours() < 4) {
      today.setDate(today.getDate() - 1)
    }

    const allDeckIds = await getAccessibleDeckIds(supabase, user.id)
    const basicStats = await getBasicStats(supabase, user.id, allDeckIds, today)

    if (!detailed) {
      return NextResponse.json({ stats: basicStats })
    }

    const detailedStats = await getDetailedStats(supabase, user.id, allDeckIds, days)

    return NextResponse.json({
      stats: {
        ...basicStats,
        ...detailedStats,
      },
    })
  } catch (error) {
    console.error('Error fetching student stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
