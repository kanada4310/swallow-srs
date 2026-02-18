/**
 * FSRS (Free Spaced Repetition Scheduler) wrapper for つばめSRS
 * Bridges between the app's CardSchedule/DeckSettings and ts-fsrs library
 */

import {
  fsrs,
  createEmptyCard,
  Rating,
  State,
  type Card as FSRSCard,
  type FSRSParameters,
  type Grade,
  type RecordLogItem,
} from 'ts-fsrs'
import type { DeckSettings } from '@/types/database'
import type { CardSchedule, CardState } from './scheduler'
import { Ease } from './scheduler'
import { easeFactorToDifficulty } from './fsrs-migration'

// === Type conversion helpers ===

/**
 * Convert app Ease (1-4) to ts-fsrs Rating (1-4)
 * They map 1:1 but are different enum types
 */
export function easeToRating(ease: Ease): Grade {
  switch (ease) {
    case Ease.Again: return Rating.Again
    case Ease.Hard: return Rating.Hard
    case Ease.Good: return Rating.Good
    case Ease.Easy: return Rating.Easy
  }
}

/**
 * Convert ts-fsrs State to app CardState
 */
export function fsrsStateToCardState(state: State): CardState {
  switch (state) {
    case State.New: return 'new'
    case State.Learning: return 'learning'
    case State.Review: return 'review'
    case State.Relearning: return 'relearning'
    default: return 'new'
  }
}

/**
 * Convert app CardState to ts-fsrs State
 */
export function cardStateToFSRSState(state: CardState): State {
  switch (state) {
    case 'new': return State.New
    case 'learning': return State.Learning
    case 'review': return State.Review
    case 'relearning': return State.Relearning
    case 'suspended': return State.Review // suspended cards keep their review state
    default: return State.New
  }
}

/**
 * Convert app CardSchedule to ts-fsrs Card
 * Handles three cases:
 * 1. New cards (no FSRS data) → createEmptyCard
 * 2. Unmigrated review/relearning cards (stability=null, state=review/relearning)
 *    → estimate FSRS values from SM-2 data (interval→stability, EF→difficulty)
 * 3. Fully FSRS cards → direct mapping
 */
export function scheduleToFSRSCard(schedule: CardSchedule): FSRSCard {
  // Case 1: New/learning cards with no FSRS data → empty card
  if (schedule.stability === null && schedule.difficulty === null &&
      (schedule.state === 'new' || schedule.state === 'learning')) {
    return createEmptyCard(schedule.due)
  }

  // Case 2: Unmigrated SM-2 review/relearning cards (stability=null but has interval data)
  // Estimate FSRS values from SM-2 data to avoid stability=0/difficulty=0
  let stability = schedule.stability
  let difficulty = schedule.difficulty
  let elapsedDays = schedule.elapsed_days
  let scheduledDays = schedule.scheduled_days
  let lastReview = schedule.last_review

  if (stability === null || difficulty === null) {
    // Estimate stability from interval (stability ≈ interval in days)
    stability = Math.max(0.1, schedule.interval)
    // Convert SM-2 easeFactor to FSRS difficulty
    difficulty = easeFactorToDifficulty(schedule.easeFactor)
    elapsedDays = schedule.interval
    scheduledDays = schedule.interval
    lastReview = schedule.due
      ? new Date(schedule.due.getTime() - schedule.interval * 24 * 60 * 60 * 1000)
      : null
  }

  // Case 3: Fully FSRS card or estimated values from Case 2
  return {
    due: schedule.due,
    stability,
    difficulty,
    elapsed_days: elapsedDays,
    scheduled_days: scheduledDays,
    learning_steps: schedule.learningStep,
    reps: schedule.repetitions,
    lapses: schedule.lapses,
    state: cardStateToFSRSState(schedule.state),
    last_review: lastReview ?? undefined,
  }
}

/**
 * Convert ts-fsrs Card result back to CardSchedule fields
 */
export function fsrsCardToScheduleFields(card: FSRSCard, prevSchedule: CardSchedule): CardSchedule {
  return {
    due: card.due,
    interval: card.scheduled_days,
    easeFactor: prevSchedule.easeFactor, // Keep SM-2 easeFactor for backward compat
    repetitions: card.reps,
    state: fsrsStateToCardState(card.state),
    learningStep: card.learning_steps,
    lapses: card.lapses,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    last_review: card.last_review ?? null,
  }
}

// === FSRS Parameters ===

/**
 * Convert minutes array to ts-fsrs StepUnit format
 * e.g., [1, 10] -> ['1m', '10m'], [60] -> ['1h'], [1440] -> ['1d']
 */
function minutesToSteps(minutes: number[]): string[] {
  return minutes.map(m => {
    if (m >= 1440 && m % 1440 === 0) return `${m / 1440}d`
    if (m >= 60 && m % 60 === 0) return `${m / 60}h`
    return `${m}m`
  })
}

/**
 * Build ts-fsrs FSRSParameters from DeckSettings
 */
export function buildFSRSParams(settings: DeckSettings): Partial<FSRSParameters> {
  const params: Partial<FSRSParameters> = {
    request_retention: settings.fsrs_desired_retention,
    maximum_interval: settings.fsrs_maximum_interval,
    enable_fuzz: settings.fsrs_enable_fuzz,
    enable_short_term: settings.fsrs_enable_short_term,
  }

  if (settings.fsrs_weights && settings.fsrs_weights.length > 0) {
    params.w = settings.fsrs_weights
  }

  // Pass learning steps from deck settings
  if (settings.learning_steps && settings.learning_steps.length > 0) {
    params.learning_steps = minutesToSteps(settings.learning_steps) as FSRSParameters['learning_steps']
  }
  if (settings.relearning_steps && settings.relearning_steps.length > 0) {
    params.relearning_steps = minutesToSteps(settings.relearning_steps) as FSRSParameters['relearning_steps']
  }

  return params
}

// === Main scheduling functions ===

/**
 * Calculate next review using FSRS algorithm
 */
export function calculateNextReviewFSRS(
  schedule: CardSchedule,
  ease: Ease,
  now: Date,
  settings: DeckSettings
): CardSchedule {
  const f = fsrs(buildFSRSParams(settings))
  const card = scheduleToFSRSCard(schedule)
  const rating = easeToRating(ease)

  const result: RecordLogItem = f.next(card, now, rating)
  return fsrsCardToScheduleFields(result.card, schedule)
}

/**
 * Get preview of next intervals for each ease option using FSRS
 */
export function getNextIntervalPreviewFSRS(
  schedule: CardSchedule,
  now: Date,
  settings: DeckSettings
): Record<Ease, string> {
  const f = fsrs(buildFSRSParams(settings))
  const card = scheduleToFSRSCard(schedule)

  const preview = f.repeat(card, now)

  const previews: Record<Ease, string> = {
    [Ease.Again]: '',
    [Ease.Hard]: '',
    [Ease.Good]: '',
    [Ease.Easy]: '',
  }

  for (const ease of [Ease.Again, Ease.Hard, Ease.Good, Ease.Easy]) {
    const rating = easeToRating(ease)
    const result = preview[rating]
    previews[ease] = formatFSRSInterval(result.card.due, now)
  }

  return previews
}

/**
 * Format interval for display (reuses same format as SM-2)
 */
function formatFSRSInterval(due: Date, now: Date): string {
  const diffMs = due.getTime() - now.getTime()
  const diffMinutes = Math.round(diffMs / (1000 * 60))
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) {
    return '1分'
  } else if (diffMinutes < 60) {
    return `${diffMinutes}分`
  } else if (diffMinutes < 60 * 24) {
    return `${Math.round(diffMinutes / 60)}時間`
  } else if (diffDays < 30) {
    return `${diffDays}日`
  } else if (diffDays < 365) {
    return `${Math.round(diffDays / 30)}ヶ月`
  } else {
    return `${Math.round(diffDays / 365)}年`
  }
}
