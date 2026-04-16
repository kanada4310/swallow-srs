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
// ?userId=xxx&deckId=yyy: returns note-level progress for a deck
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireTeacher(supabase)
    if (authError) return authError

    const searchParams = request.nextUrl.searchParams
    const targetUserId = searchParams.get('userId')
    const deckId = searchParams.get('deckId')
    const period = parseInt(searchParams.get('period') || '7', 10)

    // Get all classes (own + billing-synced), then get members
    // Using classes-first approach (same as StudentsClient) to avoid RLS issues
    const { data: classes } = await supabase
      .from('classes')
      .select('id, class_members(user_id)')
      .or(`teacher_id.eq.${user.id},billing_template_id.not.is.null`)

    interface ClassWithMembers {
      id: string
      class_members: { user_id: string }[]
    }

    const allMembers = (classes as ClassWithMembers[] || []).flatMap(c => c.class_members || [])
    const uniqueStudentIds = Array.from(new Set(allMembers.map(m => m.user_id)))

    if (targetUserId) {
      // Detailed stats for one student
      if (!uniqueStudentIds.includes(targetUserId)) {
        return NextResponse.json({ error: 'Student not found in your classes' }, { status: 403 })
      }

      // Note-level progress for a specific deck
      if (deckId) {
        return await getNoteProgress(supabase, targetUserId, deckId)
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

async function getNoteProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  deckId: string
) {
  // Get all notes in this deck with their field_values
  const { data: notes } = await supabase
    .from('notes')
    .select('id, field_values, tags')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: true })

  if (!notes || notes.length === 0) {
    return NextResponse.json({ notes: [] })
  }

  // Get all cards for these notes
  const noteIds = notes.map(n => n.id)
  const { data: cards } = await supabase
    .from('cards')
    .select('id, note_id, template_index')
    .in('note_id', noteIds)

  const cardIds = cards?.map(c => c.id) || []

  // Get card states for this user
  const { data: cardStates } = await supabase
    .from('card_states')
    .select('card_id, state, interval, due, updated_at')
    .eq('user_id', userId)
    .in('card_id', cardIds)

  const cardStateMap = new Map(cardStates?.map(cs => [cs.card_id, cs]) || [])

  // Get review logs for accuracy (all time, per card)
  const { data: reviewLogs } = await supabase
    .from('review_logs')
    .select('card_id, ease, reviewed_at')
    .eq('user_id', userId)
    .in('card_id', cardIds)
    .order('reviewed_at', { ascending: false })

  // Aggregate review stats per note
  const noteCardMap = new Map<string, string[]>()
  for (const card of cards || []) {
    const existing = noteCardMap.get(card.note_id) || []
    existing.push(card.id)
    noteCardMap.set(card.note_id, existing)
  }

  const reviewsByCard = new Map<string, Array<{ ease: number; reviewed_at: string }>>()
  for (const log of reviewLogs || []) {
    const existing = reviewsByCard.get(log.card_id) || []
    existing.push({ ease: log.ease, reviewed_at: log.reviewed_at })
    reviewsByCard.set(log.card_id, existing)
  }

  const result = notes.map(note => {
    const noteCards = noteCardMap.get(note.id) || []

    // Determine note status from its cards' states
    let status: string = 'new'
    let lastReview: string | null = null
    let totalReviews = 0
    let correctReviews = 0
    let interval = 0

    for (const cardId of noteCards) {
      const cs = cardStateMap.get(cardId)
      if (cs) {
        // Use the "worst" state across cards
        if (status === 'new' || (cs.state !== 'new' && cs.state !== 'review')) {
          status = cs.state
        }
        if (cs.state === 'review' && status === 'new') {
          status = 'review'
        }
        interval = Math.max(interval, cs.interval || 0)
      }

      const reviews = reviewsByCard.get(cardId) || []
      for (const r of reviews) {
        totalReviews++
        if (r.ease >= 3) correctReviews++
        if (!lastReview || r.reviewed_at > lastReview) {
          lastReview = r.reviewed_at
        }
      }
    }

    // Determine mastery: review + interval >= 21 days
    if (status === 'review' && interval >= 21) {
      status = 'mastered'
    }

    const accuracy = totalReviews > 0 ? Math.round((correctReviews / totalReviews) * 100) : null

    // Extract display text from field_values
    const fieldValues = note.field_values as Record<string, string> | null
    let displayText = ''
    if (fieldValues) {
      const priorityFields = ['Front', 'Text', 'Expression', 'Word']
      for (const f of priorityFields) {
        if (fieldValues[f]) {
          displayText = fieldValues[f].replace(/<[^>]+>/g, '').replace(/\{\{c\d+::([^:}]+)(?:::[^}]*)?\}\}/g, '$1').trim()
          break
        }
      }
      if (!displayText) {
        const firstKey = Object.keys(fieldValues)[0]
        if (firstKey && fieldValues[firstKey]) {
          displayText = fieldValues[firstKey].replace(/<[^>]+>/g, '').trim()
        }
      }
      if (displayText.length > 80) displayText = displayText.substring(0, 77) + '...'
    }

    return {
      noteId: note.id,
      displayText,
      tags: note.tags || [],
      status,
      interval,
      lastReview,
      totalReviews,
      accuracy,
    }
  })

  return NextResponse.json({ notes: result })
}
