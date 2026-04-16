import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeacher } from '@/lib/api/auth'
import { getAccessibleDeckIds, getBasicStats, getDetailedStats } from '@/lib/stats/calculations'

interface StudentOverview {
  id: string
  name: string
  email: string
  reviewsToday: number
  totalReviews: number
  dueCards: number
  lastActivity: string | null
  overallAccuracy: number
}

// GET /api/teacher/student-progress
// No params: returns all students overview
// ?userId=xxx&period=7: returns detailed stats for one student
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireTeacher(supabase)
    if (authError) return authError

    const searchParams = request.nextUrl.searchParams
    const targetUserId = searchParams.get('userId')
    const period = parseInt(searchParams.get('period') || '7', 10)

    // Get all student IDs in teacher's classes (own + billing-synced)
    const { data: classMembers } = await supabase
      .from('class_members')
      .select('user_id, classes!inner(teacher_id, billing_template_id)')
      .or('classes.teacher_id.eq.' + user.id + ',classes.billing_template_id.not.is.null')

    const uniqueStudentIds = Array.from(new Set(classMembers?.map(m => m.user_id) || []))

    if (targetUserId) {
      // Detailed stats for one student
      if (!uniqueStudentIds.includes(targetUserId)) {
        return NextResponse.json({ error: 'Student not found in your classes' }, { status: 403 })
      }

      // Get student profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('id', targetUserId)
        .single()

      if (!profile) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 })
      }

      const today = new Date()
      today.setHours(4, 0, 0, 0)
      if (new Date().getHours() < 4) {
        today.setDate(today.getDate() - 1)
      }

      const allDeckIds = await getAccessibleDeckIds(supabase, targetUserId)
      const basicStats = await getBasicStats(supabase, targetUserId, allDeckIds, today)
      const detailedStats = await getDetailedStats(supabase, targetUserId, allDeckIds, period)

      return NextResponse.json({
        student: { id: profile.id, name: profile.name, email: profile.email },
        stats: { ...basicStats, ...detailedStats },
      })
    }

    // Overview for all students
    const today = new Date()
    today.setHours(4, 0, 0, 0)
    if (new Date().getHours() < 4) {
      today.setDate(today.getDate() - 1)
    }

    // Batch fetch all student profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', uniqueStudentIds)

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])

    // Batch fetch today's review counts
    const { data: allReviewLogs } = await supabase
      .from('review_logs')
      .select('user_id, ease, reviewed_at')
      .in('user_id', uniqueStudentIds)
      .gte('reviewed_at', today.toISOString())

    // Batch fetch total review counts
    const { data: totalReviewData } = await supabase
      .from('review_logs')
      .select('user_id')
      .in('user_id', uniqueStudentIds)

    // Batch fetch due cards
    const { data: dueCardData } = await supabase
      .from('card_states')
      .select('user_id')
      .in('user_id', uniqueStudentIds)
      .lte('due', new Date().toISOString())
      .neq('state', 'suspended')

    // Batch fetch last activity
    const { data: lastActivityData } = await supabase
      .from('review_logs')
      .select('user_id, reviewed_at')
      .in('user_id', uniqueStudentIds)
      .order('reviewed_at', { ascending: false })

    // Batch fetch recent reviews for accuracy (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: recentReviews } = await supabase
      .from('review_logs')
      .select('user_id, ease')
      .in('user_id', uniqueStudentIds)
      .gte('reviewed_at', thirtyDaysAgo.toISOString())

    // Aggregate per student
    const reviewsTodayMap = new Map<string, number>()
    for (const log of allReviewLogs || []) {
      reviewsTodayMap.set(log.user_id, (reviewsTodayMap.get(log.user_id) || 0) + 1)
    }

    const totalReviewsMap = new Map<string, number>()
    for (const log of totalReviewData || []) {
      totalReviewsMap.set(log.user_id, (totalReviewsMap.get(log.user_id) || 0) + 1)
    }

    const dueCardsMap = new Map<string, number>()
    for (const cs of dueCardData || []) {
      dueCardsMap.set(cs.user_id, (dueCardsMap.get(cs.user_id) || 0) + 1)
    }

    const lastActivityMap = new Map<string, string>()
    for (const log of lastActivityData || []) {
      if (!lastActivityMap.has(log.user_id)) {
        lastActivityMap.set(log.user_id, log.reviewed_at)
      }
    }

    const accuracyMap = new Map<string, number>()
    const accuracyDataMap = new Map<string, { correct: number; total: number }>()
    for (const log of recentReviews || []) {
      const entry = accuracyDataMap.get(log.user_id) || { correct: 0, total: 0 }
      entry.total++
      if (log.ease >= 3) entry.correct++
      accuracyDataMap.set(log.user_id, entry)
    }
    for (const [userId, data] of Array.from(accuracyDataMap.entries())) {
      accuracyMap.set(userId, data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0)
    }

    const students: StudentOverview[] = uniqueStudentIds
      .map(studentId => {
        const profile = profileMap.get(studentId)
        if (!profile) return null
        return {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          reviewsToday: reviewsTodayMap.get(studentId) || 0,
          totalReviews: totalReviewsMap.get(studentId) || 0,
          dueCards: dueCardsMap.get(studentId) || 0,
          lastActivity: lastActivityMap.get(studentId) || null,
          overallAccuracy: accuracyMap.get(studentId) || 0,
        }
      })
      .filter((s): s is StudentOverview => s !== null)
      .sort((a, b) => b.reviewsToday - a.reviewsToday)

    return NextResponse.json({ students })
  } catch (error) {
    console.error('Error fetching student progress:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
