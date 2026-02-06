/**
 * カード並び順ロジック（オンライン/オフライン共用）
 */

import type { DeckSettings } from '@/types/database'
import type { CardSchedule } from './scheduler'

interface OrderableCard {
  schedule: CardSchedule
  createdAt?: string
}

/**
 * Shuffle an array (Fisher-Yates)
 */
function shuffle<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = shuffled[i]
    shuffled[i] = shuffled[j]
    shuffled[j] = tmp
  }
  return shuffled
}

/**
 * Order study cards according to deck settings
 */
export function orderStudyCards<T extends OrderableCard>(
  dueCards: T[],
  newCards: T[],
  remainingNewCards: number,
  todayReviewCount: number,
  settings: DeckSettings
): T[] {
  // 1. Sort due cards by review_sort setting
  let sortedDueCards: T[]
  switch (settings.review_sort) {
    case 'random':
      sortedDueCards = shuffle(dueCards)
      break
    case 'due_date_random':
      // Group by due date (day), then shuffle within each group
      sortedDueCards = [...dueCards].sort((a, b) => {
        const dayA = Math.floor(a.schedule.due.getTime() / (1000 * 60 * 60 * 24))
        const dayB = Math.floor(b.schedule.due.getTime() / (1000 * 60 * 60 * 24))
        if (dayA !== dayB) return dayA - dayB
        return Math.random() - 0.5
      })
      break
    case 'due_date':
    default:
      sortedDueCards = [...dueCards].sort((a, b) =>
        a.schedule.due.getTime() - b.schedule.due.getTime()
      )
      break
  }

  // 2. Limit due cards by max_reviews_per_day (0 = unlimited)
  if (settings.max_reviews_per_day > 0) {
    const remaining = Math.max(0, settings.max_reviews_per_day - todayReviewCount)
    sortedDueCards = sortedDueCards.slice(0, remaining)
  }

  // 3. Sort new cards by new_card_order
  let sortedNewCards: T[]
  if (settings.new_card_order === 'random') {
    sortedNewCards = shuffle(newCards)
  } else {
    // sequential - keep original order (by creation order)
    sortedNewCards = [...newCards]
  }
  sortedNewCards = sortedNewCards.slice(0, remainingNewCards)

  // 4. Combine by new_review_mix
  switch (settings.new_review_mix) {
    case 'new_first':
      return [...sortedNewCards, ...sortedDueCards]
    case 'mix': {
      // Interleave: distribute new cards evenly among review cards
      const result: T[] = []
      const total = sortedDueCards.length + sortedNewCards.length
      if (total === 0) return []
      const newRatio = sortedNewCards.length / total
      let newIdx = 0
      let dueIdx = 0
      for (let i = 0; i < total; i++) {
        const expectedNew = Math.round((i + 1) * newRatio)
        if (newIdx < expectedNew && newIdx < sortedNewCards.length) {
          result.push(sortedNewCards[newIdx++])
        } else if (dueIdx < sortedDueCards.length) {
          result.push(sortedDueCards[dueIdx++])
        } else if (newIdx < sortedNewCards.length) {
          result.push(sortedNewCards[newIdx++])
        }
      }
      return result
    }
    case 'review_first':
    default:
      return [...sortedDueCards, ...sortedNewCards]
  }
}
