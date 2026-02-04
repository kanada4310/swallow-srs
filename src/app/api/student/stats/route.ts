import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import type { DailyReviewData, CardDistribution, AccuracyData, DeckProgressData, DetailedStats } from '@/types/database'

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

    // Get all deck IDs accessible to this user
    const allDeckIds = await getAccessibleDeckIds(supabase, user.id)

    // Get basic stats
    const basicStats = await getBasicStats(supabase, user.id, allDeckIds, today)

    if (!detailed) {
      return NextResponse.json({ stats: basicStats })
    }

    // Get detailed stats
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

async function getAccessibleDeckIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string[]> {
  // Get decks assigned directly to user
  const { data: assignedDecks } = await supabase
    .from('deck_assignments')
    .select('deck_id')
    .eq('user_id', userId)

  // Get decks through class assignments
  const { data: classAssignments } = await supabase
    .from('deck_assignments')
    .select('deck_id, class_id')
    .not('class_id', 'is', null)

  const { data: userClasses } = await supabase
    .from('class_members')
    .select('class_id')
    .eq('user_id', userId)

  const userClassIds = new Set(userClasses?.map(c => c.class_id) || [])
  const classAssignedDeckIds = classAssignments
    ?.filter(a => a.class_id && userClassIds.has(a.class_id))
    .map(a => a.deck_id) || []

  const directAssignedDeckIds = assignedDecks?.map(d => d.deck_id) || []

  // Also include own decks
  const { data: ownDecks } = await supabase
    .from('decks')
    .select('id')
    .eq('owner_id', userId)

  const ownDeckIds = ownDecks?.map(d => d.id) || []

  return Array.from(new Set([...directAssignedDeckIds, ...classAssignedDeckIds, ...ownDeckIds]))
}

async function getBasicStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  allDeckIds: string[],
  today: Date
) {
  // Get review cards due now
  const { count: dueCards } = await supabase
    .from('card_states')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('state', 'review')
    .lte('due', new Date().toISOString())

  let newCards = 0
  let learningCards = 0

  if (allDeckIds.length > 0) {
    // Get all cards in accessible decks
    const { data: allCards } = await supabase
      .from('cards')
      .select('id')
      .in('deck_id', allDeckIds)

    const allCardIds = allCards?.map(c => c.id) || []

    // Get card states for this user
    const { data: cardStates } = await supabase
      .from('card_states')
      .select('card_id, state')
      .eq('user_id', userId)
      .in('card_id', allCardIds)

    const cardStateMap = new Map(cardStates?.map(cs => [cs.card_id, cs.state]) || [])

    // Count new and learning cards
    for (const cardId of allCardIds) {
      const state = cardStateMap.get(cardId)
      if (!state) {
        newCards++
      } else if (state === 'learning' || state === 'relearning') {
        learningCards++
      }
    }
  }

  // Get reviews done today
  const { count: reviewsToday } = await supabase
    .from('review_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('reviewed_at', today.toISOString())

  // Get recent activity (last 7 days)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const { data: recentReviews } = await supabase
    .from('review_logs')
    .select('reviewed_at, ease')
    .eq('user_id', userId)
    .gte('reviewed_at', weekAgo.toISOString())
    .order('reviewed_at', { ascending: false })
    .limit(100)

  // Calculate streak (consecutive days with reviews)
  const reviewDates = new Set(
    recentReviews?.map(r => {
      const d = new Date(r.reviewed_at)
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    }) || []
  )

  let streak = 0
  const checkDate = new Date()
  while (streak < 365) {
    const dateStr = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`
    if (reviewDates.has(dateStr)) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else if (streak === 0 && checkDate.toDateString() === new Date().toDateString()) {
      // Today might not have reviews yet, check yesterday
      checkDate.setDate(checkDate.getDate() - 1)
    } else {
      break
    }
  }

  return {
    dueCards: dueCards || 0,
    newCards,
    learningCards,
    reviewsToday: reviewsToday || 0,
    streak,
  }
}

async function getDetailedStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  allDeckIds: string[],
  days: number
): Promise<Partial<DetailedStats>> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  startDate.setHours(0, 0, 0, 0)

  // Get all review logs in the period
  const { data: reviewLogs } = await supabase
    .from('review_logs')
    .select('reviewed_at, ease, time_ms, card_id')
    .eq('user_id', userId)
    .gte('reviewed_at', startDate.toISOString())
    .order('reviewed_at', { ascending: true })

  // Get all card states
  const { data: cardStates } = await supabase
    .from('card_states')
    .select('card_id, state')
    .eq('user_id', userId)

  // Calculate daily reviews
  const dailyReviews = calculateDailyReviews(reviewLogs || [], days)

  // Calculate card distribution
  const cardDistribution = calculateCardDistribution(cardStates || [], allDeckIds, supabase, userId)

  // Calculate accuracy trend
  const accuracyTrend = calculateAccuracyTrend(reviewLogs || [], days)

  // Calculate deck progress
  const deckProgress = await calculateDeckProgress(supabase, userId, allDeckIds)

  // Calculate time stats
  const timeStats = calculateTimeStats(reviewLogs || [])

  // Calculate overall stats
  const totalReviews = reviewLogs?.length || 0
  const correctReviews = reviewLogs?.filter(r => r.ease >= 3).length || 0
  const overallAccuracy = totalReviews > 0 ? Math.round((correctReviews / totalReviews) * 100) : 0

  return {
    dailyReviews,
    cardDistribution: await cardDistribution,
    accuracyTrend,
    deckProgress,
    timeStats,
    totalReviews,
    overallAccuracy,
  }
}

function calculateDailyReviews(
  reviewLogs: Array<{ reviewed_at: string; ease: number }>,
  days: number
): DailyReviewData[] {
  const dailyMap = new Map<string, { total: number; correct: number; incorrect: number }>()

  // Initialize all days
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    dailyMap.set(dateStr, { total: 0, correct: 0, incorrect: 0 })
  }

  // Aggregate reviews
  for (const log of reviewLogs) {
    const dateStr = new Date(log.reviewed_at).toISOString().split('T')[0]
    const entry = dailyMap.get(dateStr)
    if (entry) {
      entry.total++
      if (log.ease >= 3) {
        entry.correct++
      } else {
        entry.incorrect++
      }
    }
  }

  return Array.from(dailyMap.entries()).map(([date, data]) => ({
    date,
    ...data,
  }))
}

async function calculateCardDistribution(
  cardStates: Array<{ card_id: string; state: string }>,
  allDeckIds: string[],
  supabase: Awaited<ReturnType<typeof createClient>>,
  _userId: string
): Promise<CardDistribution> {
  let totalCards = 0

  if (allDeckIds.length > 0) {
    const { count } = await supabase
      .from('cards')
      .select('*', { count: 'exact', head: true })
      .in('deck_id', allDeckIds)
    totalCards = count || 0
  }

  const stateCount = {
    new: 0,
    learning: 0,
    review: 0,
    relearning: 0,
  }

  const statedCardIds = new Set<string>()
  for (const cs of cardStates) {
    statedCardIds.add(cs.card_id)
    if (cs.state === 'learning') stateCount.learning++
    else if (cs.state === 'review') stateCount.review++
    else if (cs.state === 'relearning') stateCount.relearning++
  }

  // Cards without state are "new"
  stateCount.new = Math.max(0, totalCards - statedCardIds.size)

  return stateCount
}

function calculateAccuracyTrend(
  reviewLogs: Array<{ reviewed_at: string; ease: number }>,
  days: number
): AccuracyData[] {
  const dailyMap = new Map<string, { correct: number; total: number }>()

  // Initialize all days
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    dailyMap.set(dateStr, { correct: 0, total: 0 })
  }

  // Aggregate reviews
  for (const log of reviewLogs) {
    const dateStr = new Date(log.reviewed_at).toISOString().split('T')[0]
    const entry = dailyMap.get(dateStr)
    if (entry) {
      entry.total++
      if (log.ease >= 3) {
        entry.correct++
      }
    }
  }

  return Array.from(dailyMap.entries()).map(([date, data]) => ({
    date,
    accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
  }))
}

async function calculateDeckProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  allDeckIds: string[]
): Promise<DeckProgressData[]> {
  if (allDeckIds.length === 0) return []

  // Get deck info
  const { data: decks } = await supabase
    .from('decks')
    .select('id, name')
    .in('id', allDeckIds)

  const deckProgress: DeckProgressData[] = []

  for (const deck of decks || []) {
    // Get cards in this deck
    const { data: cards } = await supabase
      .from('cards')
      .select('id')
      .eq('deck_id', deck.id)

    const cardIds = cards?.map(c => c.id) || []
    const totalCards = cardIds.length

    if (totalCards === 0) {
      deckProgress.push({
        deckId: deck.id,
        deckName: deck.name,
        totalCards: 0,
        masteredCards: 0,
        learningCards: 0,
        newCards: 0,
      })
      continue
    }

    // Get card states
    const { data: states } = await supabase
      .from('card_states')
      .select('card_id, state, interval')
      .eq('user_id', userId)
      .in('card_id', cardIds)

    const stateMap = new Map(states?.map(s => [s.card_id, s]) || [])

    let masteredCards = 0
    let learningCards = 0
    let newCards = 0

    for (const cardId of cardIds) {
      const state = stateMap.get(cardId)
      if (!state) {
        newCards++
      } else if (state.state === 'review' && state.interval >= 21) {
        // Mastered: review state with interval >= 21 days
        masteredCards++
      } else if (state.state === 'learning' || state.state === 'relearning') {
        learningCards++
      }
    }

    deckProgress.push({
      deckId: deck.id,
      deckName: deck.name,
      totalCards,
      masteredCards,
      learningCards,
      newCards,
    })
  }

  return deckProgress
}

function calculateTimeStats(
  reviewLogs: Array<{ time_ms: number | null }>
): { totalReviewTime: number; averageTimePerCard: number } {
  const validTimes = reviewLogs.filter(r => r.time_ms !== null).map(r => r.time_ms!)
  const totalReviewTime = validTimes.reduce((sum, t) => sum + t, 0)
  const averageTimePerCard = validTimes.length > 0 ? Math.round(totalReviewTime / validTimes.length) : 0

  return { totalReviewTime, averageTimePerCard }
}
