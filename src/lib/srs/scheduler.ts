/**
 * SM-2 SRS Algorithm for つばめSRS
 */

import type { DeckSettings } from '@/types/database'

export type CardState = 'new' | 'learning' | 'review' | 'relearning' | 'suspended'

export enum Ease {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

export interface CardSchedule {
  due: Date
  interval: number // days
  easeFactor: number
  repetitions: number
  state: CardState
  learningStep: number
  lapses: number
}

export interface ReviewResult {
  schedule: CardSchedule
  isLeech: boolean
}

// Default values
const DEFAULT_EASE_FACTOR = 2.5
const MIN_EASE_FACTOR = 1.3

/**
 * Get default deck settings
 */
export function getDefaultDeckSettings(): DeckSettings {
  return {
    new_cards_per_day: 20,
    learning_steps: [1, 10],
    graduating_interval: 1,
    easy_interval: 4,
    new_card_order: 'sequential',
    max_reviews_per_day: 200,
    easy_bonus: 1.3,
    interval_modifier: 1.0,
    max_interval: 36500,
    hard_interval_modifier: 1.2,
    relearning_steps: [10],
    lapse_new_interval: 0.5,
    lapse_min_interval: 1,
    leech_threshold: 8,
    leech_action: 'tag',
    new_review_mix: 'review_first',
    review_sort: 'due_date',
  }
}

/**
 * Resolve partial deck settings with defaults
 */
export function resolveDeckSettings(partial?: Partial<DeckSettings>): DeckSettings {
  const defaults = getDefaultDeckSettings()
  if (!partial) return defaults
  return { ...defaults, ...partial }
}

/**
 * Get the start of the study day (4:00 AM)
 */
export function getStudyDayStart(date: Date, resetHour: number = 4): Date {
  const result = new Date(date)
  if (result.getHours() < resetHour) {
    result.setDate(result.getDate() - 1)
  }
  result.setHours(resetHour, 0, 0, 0)
  return result
}

/**
 * Check if a card is due for review
 */
export function isDue(schedule: CardSchedule, now: Date = new Date()): boolean {
  return schedule.due <= now
}

/**
 * Create initial schedule for a new card
 */
export function createInitialSchedule(): CardSchedule {
  return {
    due: new Date(),
    interval: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    repetitions: 0,
    state: 'new',
    learningStep: 0,
    lapses: 0,
  }
}

/**
 * Update ease factor based on response
 * SM-2 formula: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
 */
function updateEaseFactor(currentEF: number, ease: Ease): number {
  const q = ease + 1 // Convert 1-4 to 2-5 for SM-2 formula
  const newEF = currentEF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  return Math.max(MIN_EASE_FACTOR, newEF)
}

/**
 * Calculate next interval for review cards
 */
function calculateNextInterval(
  currentInterval: number,
  easeFactor: number,
  ease: Ease,
  settings: DeckSettings
): number {
  if (ease === Ease.Again) {
    return 1 // Reset to 1 day
  }

  let modifier = 1
  if (ease === Ease.Hard) {
    modifier = settings.hard_interval_modifier
  } else if (ease === Ease.Good) {
    modifier = easeFactor
  } else if (ease === Ease.Easy) {
    modifier = easeFactor * settings.easy_bonus
  }

  const newInterval = Math.max(1, Math.round(currentInterval * modifier * settings.interval_modifier))
  return Math.min(newInterval, settings.max_interval)
}

/**
 * Calculate next review based on current schedule and ease response
 */
export function calculateNextReview(
  schedule: CardSchedule,
  ease: Ease,
  now: Date = new Date(),
  partialSettings?: Partial<DeckSettings>
): CardSchedule {
  const settings = resolveDeckSettings(partialSettings)
  const newSchedule = { ...schedule }
  // Ensure lapses is initialized
  if (newSchedule.lapses === undefined || newSchedule.lapses === null) {
    newSchedule.lapses = 0
  }

  switch (schedule.state) {
    case 'new':
    case 'learning':
      return handleLearningState(newSchedule, ease, settings.learning_steps, now, settings)

    case 'relearning':
      return handleLearningState(newSchedule, ease, settings.relearning_steps, now, settings)

    case 'review':
      return handleReviewState(newSchedule, ease, now, settings)

    default:
      return newSchedule
  }
}

/**
 * Handle learning/relearning state
 */
function handleLearningState(
  schedule: CardSchedule,
  ease: Ease,
  steps: number[],
  now: Date,
  settings: DeckSettings
): CardSchedule {
  const newSchedule = { ...schedule }

  if (ease === Ease.Again) {
    // Reset to first step
    newSchedule.learningStep = 0
    newSchedule.due = addMinutes(now, steps[0])
    // Keep learning state, only relearning stays as relearning
    if (schedule.state === 'new' || schedule.state === 'learning') {
      newSchedule.state = 'learning'
    }
    // relearning stays as relearning (already set from schedule)
  } else if (ease === Ease.Easy) {
    // Graduate immediately with easy bonus
    newSchedule.state = 'review'
    newSchedule.interval = settings.easy_interval
    newSchedule.due = addDays(now, settings.easy_interval)
    newSchedule.repetitions = 1
    newSchedule.learningStep = 0
  } else {
    // Good or Hard - advance step
    const nextStep = ease === Ease.Hard
      ? schedule.learningStep
      : schedule.learningStep + 1

    if (nextStep >= steps.length) {
      // Graduate to review
      newSchedule.state = 'review'
      newSchedule.interval = settings.graduating_interval
      newSchedule.due = addDays(now, settings.graduating_interval)
      newSchedule.repetitions = 1
      newSchedule.learningStep = 0
    } else {
      // Continue learning
      newSchedule.learningStep = nextStep
      newSchedule.due = addMinutes(now, steps[nextStep])
      if (newSchedule.state === 'new') {
        newSchedule.state = 'learning'
      }
    }
  }

  return newSchedule
}

/**
 * Handle review state
 */
function handleReviewState(
  schedule: CardSchedule,
  ease: Ease,
  now: Date,
  settings: DeckSettings
): CardSchedule {
  const newSchedule = { ...schedule }

  // Update ease factor
  newSchedule.easeFactor = updateEaseFactor(schedule.easeFactor, ease)

  if (ease === Ease.Again) {
    // Lapse - go to relearning
    newSchedule.state = 'relearning'
    newSchedule.learningStep = 0
    newSchedule.lapses = (schedule.lapses || 0) + 1
    newSchedule.due = addMinutes(now, settings.relearning_steps[0] ?? 10)
    // Apply lapse interval reduction
    newSchedule.interval = Math.max(
      settings.lapse_min_interval,
      Math.round(schedule.interval * settings.lapse_new_interval)
    )
  } else {
    // Calculate new interval
    newSchedule.interval = calculateNextInterval(
      schedule.interval,
      newSchedule.easeFactor,
      ease,
      settings
    )
    newSchedule.due = addDays(now, newSchedule.interval)
    newSchedule.repetitions = schedule.repetitions + 1
  }

  return newSchedule
}

/**
 * Check if a card has become a leech after a lapse
 */
export function checkLeech(schedule: CardSchedule, settings: DeckSettings): boolean {
  if (settings.leech_threshold === 0) return false
  return schedule.lapses >= settings.leech_threshold &&
    schedule.lapses % Math.max(1, Math.floor(settings.leech_threshold / 2)) === 0
}

/**
 * Add minutes to a date
 */
function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

/**
 * Add days to a date
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Get preview of next intervals for each ease option
 */
export function getNextIntervalPreview(
  schedule: CardSchedule,
  now: Date = new Date(),
  partialSettings?: Partial<DeckSettings>
): Record<Ease, string> {
  const previews: Record<Ease, string> = {
    [Ease.Again]: '',
    [Ease.Hard]: '',
    [Ease.Good]: '',
    [Ease.Easy]: '',
  }

  for (const ease of [Ease.Again, Ease.Hard, Ease.Good, Ease.Easy]) {
    const next = calculateNextReview(schedule, ease, now, partialSettings)
    previews[ease] = formatInterval(next.due, now)
  }

  return previews
}

/**
 * Format interval for display
 */
function formatInterval(due: Date, now: Date): string {
  const diffMs = due.getTime() - now.getTime()
  const diffMinutes = Math.round(diffMs / (1000 * 60))
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 60) {
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
