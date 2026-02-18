/**
 * SM-2 → FSRS migration utilities
 * Converts existing SM-2 card states to FSRS-compatible initial values
 */

import type { CardSchedule } from './scheduler'

/**
 * Migrate a single CardSchedule from SM-2 to FSRS format.
 *
 * - new/learning cards: Leave stability/difficulty null (FSRS will initialize on first review)
 * - review/relearning cards: Estimate stability from interval, convert easeFactor to difficulty
 */
export function migrateScheduleToFSRS(schedule: CardSchedule): CardSchedule {
  const migrated = { ...schedule }

  if (schedule.state === 'new' || schedule.state === 'learning') {
    // New/learning cards: FSRS will initialize on first review
    migrated.stability = null
    migrated.difficulty = null
    migrated.elapsed_days = 0
    migrated.scheduled_days = 0
    migrated.last_review = null
    return migrated
  }

  // review/relearning cards: estimate FSRS values from SM-2 data
  // Stability ≈ current interval (the interval at which retention = ~90%)
  migrated.stability = Math.max(0.1, schedule.interval)

  // Convert easeFactor (1.3-2.5+) to FSRS difficulty (1-10)
  // EF 2.5 (easy) → D ~3, EF 1.3 (hard) → D ~9
  migrated.difficulty = easeFactorToDifficulty(schedule.easeFactor)

  // elapsed_days = days since last review (approximation: interval)
  migrated.elapsed_days = schedule.interval
  migrated.scheduled_days = schedule.interval
  migrated.last_review = schedule.due
    ? new Date(schedule.due.getTime() - schedule.interval * 24 * 60 * 60 * 1000)
    : null

  return migrated
}

/**
 * Convert SM-2 ease factor to FSRS difficulty (1-10)
 * EF range: 1.3 (hardest) to ~3.0+ (easiest)
 * FSRS D range: 1 (easiest) to 10 (hardest)
 */
export function easeFactorToDifficulty(easeFactor: number): number {
  // Linear mapping: EF 1.3 → D 9, EF 2.5 → D 3
  // D = 9 - (EF - 1.3) * (6 / 1.2)
  const d = 9 - (easeFactor - 1.3) * 5
  return Math.max(1, Math.min(10, Math.round(d * 100) / 100))
}
