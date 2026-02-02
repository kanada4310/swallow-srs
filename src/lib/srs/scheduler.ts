/**
 * SM-2 SRS Algorithm for つばめSRS
 */

export type CardState = 'new' | 'learning' | 'review' | 'relearning'

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
}

// Learning steps in minutes
const LEARNING_STEPS = [1, 10]
const RELEARNING_STEPS = [10]

// Default values
const DEFAULT_EASE_FACTOR = 2.5
const MIN_EASE_FACTOR = 1.3
const GRADUATING_INTERVAL = 1 // days
const EASY_INTERVAL = 4 // days

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
  ease: Ease
): number {
  if (ease === Ease.Again) {
    return 1 // Reset to 1 day
  }

  let modifier = 1
  if (ease === Ease.Hard) {
    modifier = 1.2
  } else if (ease === Ease.Good) {
    modifier = easeFactor
  } else if (ease === Ease.Easy) {
    modifier = easeFactor * 1.3
  }

  return Math.max(1, Math.round(currentInterval * modifier))
}

/**
 * Calculate next review based on current schedule and ease response
 */
export function calculateNextReview(
  schedule: CardSchedule,
  ease: Ease,
  now: Date = new Date()
): CardSchedule {
  const newSchedule = { ...schedule }

  switch (schedule.state) {
    case 'new':
    case 'learning':
      return handleLearningState(newSchedule, ease, LEARNING_STEPS, now)

    case 'relearning':
      return handleLearningState(newSchedule, ease, RELEARNING_STEPS, now)

    case 'review':
      return handleReviewState(newSchedule, ease, now)

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
  now: Date
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
    newSchedule.interval = EASY_INTERVAL
    newSchedule.due = addDays(now, EASY_INTERVAL)
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
      newSchedule.interval = GRADUATING_INTERVAL
      newSchedule.due = addDays(now, GRADUATING_INTERVAL)
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
  now: Date
): CardSchedule {
  const newSchedule = { ...schedule }

  // Update ease factor
  newSchedule.easeFactor = updateEaseFactor(schedule.easeFactor, ease)

  if (ease === Ease.Again) {
    // Lapse - go to relearning
    newSchedule.state = 'relearning'
    newSchedule.learningStep = 0
    newSchedule.due = addMinutes(now, RELEARNING_STEPS[0])
    // Interval will be reset after relearning
    newSchedule.interval = Math.max(1, Math.round(schedule.interval * 0.5))
  } else {
    // Calculate new interval
    newSchedule.interval = calculateNextInterval(
      schedule.interval,
      newSchedule.easeFactor,
      ease
    )
    newSchedule.due = addDays(now, newSchedule.interval)
    newSchedule.repetitions = schedule.repetitions + 1
  }

  return newSchedule
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
  now: Date = new Date()
): Record<Ease, string> {
  const previews: Record<Ease, string> = {
    [Ease.Again]: '',
    [Ease.Hard]: '',
    [Ease.Good]: '',
    [Ease.Easy]: '',
  }

  for (const ease of [Ease.Again, Ease.Hard, Ease.Good, Ease.Easy]) {
    const next = calculateNextReview(schedule, ease, now)
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
