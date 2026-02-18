import { describe, it, expect } from 'vitest'
import { migrateScheduleToFSRS, easeFactorToDifficulty } from './fsrs-migration'
import { createInitialSchedule, type CardSchedule } from './scheduler'

describe('FSRS Migration', () => {
  describe('migrateScheduleToFSRS', () => {
    it('should keep new cards with null FSRS fields', () => {
      const schedule = createInitialSchedule()
      const migrated = migrateScheduleToFSRS(schedule)
      expect(migrated.stability).toBeNull()
      expect(migrated.difficulty).toBeNull()
      expect(migrated.elapsed_days).toBe(0)
      expect(migrated.scheduled_days).toBe(0)
      expect(migrated.last_review).toBeNull()
    })

    it('should keep learning cards with null FSRS fields', () => {
      const schedule: CardSchedule = {
        ...createInitialSchedule(),
        state: 'learning',
        learningStep: 1,
      }
      const migrated = migrateScheduleToFSRS(schedule)
      expect(migrated.stability).toBeNull()
      expect(migrated.difficulty).toBeNull()
    })

    it('should estimate stability from interval for review cards', () => {
      const schedule: CardSchedule = {
        ...createInitialSchedule(),
        state: 'review',
        interval: 15,
        easeFactor: 2.5,
        repetitions: 5,
        due: new Date('2024-01-20T10:00:00'),
      }
      const migrated = migrateScheduleToFSRS(schedule)
      expect(migrated.stability).toBe(15) // stability ≈ interval
      expect(migrated.difficulty).not.toBeNull()
      expect(migrated.elapsed_days).toBe(15)
      expect(migrated.scheduled_days).toBe(15)
    })

    it('should estimate stability from interval for relearning cards', () => {
      const schedule: CardSchedule = {
        ...createInitialSchedule(),
        state: 'relearning',
        interval: 5,
        easeFactor: 1.8,
        repetitions: 3,
        lapses: 2,
        due: new Date('2024-01-20T10:00:00'),
      }
      const migrated = migrateScheduleToFSRS(schedule)
      expect(migrated.stability).toBe(5)
      expect(migrated.difficulty).not.toBeNull()
      expect(migrated.lapses).toBe(2) // preserved
    })

    it('should handle minimum interval for stability', () => {
      const schedule: CardSchedule = {
        ...createInitialSchedule(),
        state: 'review',
        interval: 0,
        easeFactor: 2.5,
        due: new Date('2024-01-15T10:00:00'),
      }
      const migrated = migrateScheduleToFSRS(schedule)
      expect(migrated.stability).toBe(0.1) // minimum 0.1
    })

    it('should calculate last_review from due and interval', () => {
      const due = new Date('2024-01-20T10:00:00')
      const schedule: CardSchedule = {
        ...createInitialSchedule(),
        state: 'review',
        interval: 10,
        easeFactor: 2.5,
        due,
      }
      const migrated = migrateScheduleToFSRS(schedule)
      expect(migrated.last_review).not.toBeNull()
      // last_review should be 10 days before due
      const expected = new Date(due.getTime() - 10 * 24 * 60 * 60 * 1000)
      expect(migrated.last_review!.getTime()).toBe(expected.getTime())
    })
  })

  describe('easeFactorToDifficulty', () => {
    it('should convert EF 2.5 (easy) to low difficulty', () => {
      const d = easeFactorToDifficulty(2.5)
      expect(d).toBe(3) // Easy card -> low difficulty
    })

    it('should convert EF 1.3 (hard) to high difficulty', () => {
      const d = easeFactorToDifficulty(1.3)
      expect(d).toBe(9) // Hard card -> high difficulty
    })

    it('should clamp difficulty to 1-10 range', () => {
      expect(easeFactorToDifficulty(3.5)).toBeGreaterThanOrEqual(1)
      expect(easeFactorToDifficulty(3.5)).toBeLessThanOrEqual(10)
      expect(easeFactorToDifficulty(1.0)).toBeGreaterThanOrEqual(1)
      expect(easeFactorToDifficulty(1.0)).toBeLessThanOrEqual(10)
    })

    it('should be monotonically decreasing (higher EF = lower difficulty)', () => {
      const d1 = easeFactorToDifficulty(1.3)
      const d2 = easeFactorToDifficulty(1.8)
      const d3 = easeFactorToDifficulty(2.5)
      expect(d1).toBeGreaterThan(d2)
      expect(d2).toBeGreaterThan(d3)
    })
  })
})
