import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeacher } from '@/lib/api/auth'

// GET /api/teacher/stats - Get teacher dashboard statistics
export async function GET() {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireTeacher(supabase)
    if (authError) return authError

    // Get class count
    const { count: classCount } = await supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', user.id)

    // Get student count (unique students in teacher's classes)
    const { data: classMembers } = await supabase
      .from('class_members')
      .select('user_id, classes!inner(teacher_id)')
      .eq('classes.teacher_id', user.id)

    const uniqueStudentIds = new Set(classMembers?.map(m => m.user_id) || [])
    const studentCount = uniqueStudentIds.size

    // Get deck count
    const { count: deckCount } = await supabase
      .from('decks')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', user.id)

    // Get total card count across all teacher's decks
    const { data: decks } = await supabase
      .from('decks')
      .select('id')
      .eq('owner_id', user.id)

    const deckIds = decks?.map(d => d.id) || []

    let cardCount = 0
    if (deckIds.length > 0) {
      const { count } = await supabase
        .from('cards')
        .select('*', { count: 'exact', head: true })
        .in('deck_id', deckIds)
      cardCount = count || 0
    }

    // Get students with their progress
    const studentsWithProgress = []

    if (uniqueStudentIds.size > 0) {
      for (const studentId of Array.from(uniqueStudentIds)) {
        // Get student profile
        const { data: studentProfile } = await supabase
          .from('profiles')
          .select('id, name, email')
          .eq('id', studentId)
          .single()

        if (studentProfile) {
          // Get student's review stats for today
          const today = new Date()
          today.setHours(4, 0, 0, 0) // Reset at 4 AM
          if (new Date().getHours() < 4) {
            today.setDate(today.getDate() - 1)
          }

          const { count: reviewsToday } = await supabase
            .from('review_logs')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', studentId)
            .gte('reviewed_at', today.toISOString())

          // Get total reviews ever
          const { count: totalReviews } = await supabase
            .from('review_logs')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', studentId)

          // Get due cards count
          const { count: dueCards } = await supabase
            .from('card_states')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', studentId)
            .lte('due', new Date().toISOString())

          // Get last activity
          const { data: lastReview } = await supabase
            .from('review_logs')
            .select('reviewed_at')
            .eq('user_id', studentId)
            .order('reviewed_at', { ascending: false })
            .limit(1)
            .single()

          studentsWithProgress.push({
            id: studentProfile.id,
            name: studentProfile.name,
            email: studentProfile.email,
            reviewsToday: reviewsToday || 0,
            totalReviews: totalReviews || 0,
            dueCards: dueCards || 0,
            lastActivity: lastReview?.reviewed_at || null,
          })
        }
      }

      // Sort by reviews today (descending)
      studentsWithProgress.sort((a, b) => b.reviewsToday - a.reviewsToday)
    }

    return NextResponse.json({
      stats: {
        studentCount,
        classCount: classCount || 0,
        deckCount: deckCount || 0,
        cardCount,
      },
      students: studentsWithProgress.slice(0, 10), // Top 10 students
    })
  } catch (error) {
    console.error('Error fetching teacher stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
