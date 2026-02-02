import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CardSchedule,
  Ease,
  calculateNextReview,
  createInitialSchedule,
  isDue,
  getStudyDayStart,
  getNextIntervalPreview,
} from './scheduler'

describe('SRS Scheduler', () => {
  const fixedDate = new Date('2024-01-15T10:00:00')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(fixedDate)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('createInitialSchedule', () => {
    it('should create a new card schedule with default values', () => {
      const schedule = createInitialSchedule()
      expect(schedule.state).toBe('new')
      expect(schedule.interval).toBe(0)
      expect(schedule.easeFactor).toBe(2.5)
      expect(schedule.repetitions).toBe(0)
      expect(schedule.learningStep).toBe(0)
    })
  })

  describe('isDue', () => {
    it('should return true when due date is in the past', () => {
      const schedule: CardSchedule = {
        ...createInitialSchedule(),
        due: new Date('2024-01-14T10:00:00'),
      }
      expect(isDue(schedule, fixedDate)).toBe(true)
    })

    it('should return true when due date is now', () => {
      const schedule: CardSchedule = {
        ...createInitialSchedule(),
        due: fixedDate,
      }
      expect(isDue(schedule, fixedDate)).toBe(true)
    })

    it('should return false when due date is in the future', () => {
      const schedule: CardSchedule = {
        ...createInitialSchedule(),
        due: new Date('2024-01-16T10:00:00'),
      }
      expect(isDue(schedule, fixedDate)).toBe(false)
    })
  })

  describe('getStudyDayStart', () => {
    it('should return same day 4AM for times after 4AM', () => {
      const date = new Date('2024-01-15T10:00:00')
      const result = getStudyDayStart(date)
      expect(result.getDate()).toBe(15)
      expect(result.getHours()).toBe(4)
      expect(result.getMinutes()).toBe(0)
    })

    it('should return previous day 4AM for times before 4AM', () => {
      const date = new Date('2024-01-15T03:00:00')
      const result = getStudyDayStart(date)
      expect(result.getDate()).toBe(14)
      expect(result.getHours()).toBe(4)
    })
  })

  describe('calculateNextReview - New Card', () => {
    const newSchedule: CardSchedule = {
      due: fixedDate,
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      state: 'new',
      learningStep: 0,
    }

    it('should move to learning state on Again', () => {
      const result = calculateNextReview(newSchedule, Ease.Again, fixedDate)
      expect(result.state).toBe('learning')
      expect(result.learningStep).toBe(0)
      // Due in 1 minute
      expect(result.due.getTime() - fixedDate.getTime()).toBe(1 * 60 * 1000)
    })

    it('should advance learning step on Good', () => {
      const result = calculateNextReview(newSchedule, Ease.Good, fixedDate)
      expect(result.state).toBe('learning')
      expect(result.learningStep).toBe(1)
      // Due in 10 minutes
      expect(result.due.getTime() - fixedDate.getTime()).toBe(10 * 60 * 1000)
    })

    it('should graduate immediately on Easy with 4-day interval', () => {
      const result = calculateNextReview(newSchedule, Ease.Easy, fixedDate)
      expect(result.state).toBe('review')
      expect(result.interval).toBe(4)
      expect(result.repetitions).toBe(1)
    })
  })

  describe('calculateNextReview - Learning Card', () => {
    const learningSchedule: CardSchedule = {
      due: fixedDate,
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      state: 'learning',
      learningStep: 1, // At step 1 (10 min)
    }

    it('should reset to step 0 on Again', () => {
      const result = calculateNextReview(learningSchedule, Ease.Again, fixedDate)
      // State stays as learning for cards still in learning phase
      expect(result.state).toBe('learning')
      expect(result.learningStep).toBe(0)
    })

    it('should graduate to review on Good when at last step', () => {
      const result = calculateNextReview(learningSchedule, Ease.Good, fixedDate)
      expect(result.state).toBe('review')
      expect(result.interval).toBe(1)
      expect(result.repetitions).toBe(1)
    })

    it('should stay at same step on Hard', () => {
      const result = calculateNextReview(learningSchedule, Ease.Hard, fixedDate)
      expect(result.learningStep).toBe(1)
    })
  })

  describe('calculateNextReview - Review Card', () => {
    const reviewSchedule: CardSchedule = {
      due: fixedDate,
      interval: 10,
      easeFactor: 2.5,
      repetitions: 3,
      state: 'review',
      learningStep: 0,
    }

    it('should lapse to relearning on Again', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Again, fixedDate)
      expect(result.state).toBe('relearning')
      expect(result.learningStep).toBe(0)
      // Interval should be halved
      expect(result.interval).toBe(5)
    })

    it('should increase interval on Good', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Good, fixedDate)
      expect(result.state).toBe('review')
      expect(result.interval).toBe(25) // 10 * 2.5 = 25
      expect(result.repetitions).toBe(4)
    })

    it('should increase interval more on Easy', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Easy, fixedDate)
      expect(result.state).toBe('review')
      // 10 * 2.6 * 1.3 ≈ 33.8 → 34 (ease factor increases on Easy before calculation)
      expect(result.interval).toBe(34)
    })

    it('should use smaller multiplier on Hard', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Hard, fixedDate)
      expect(result.state).toBe('review')
      expect(result.interval).toBe(12) // 10 * 1.2 = 12
    })
  })

  describe('Ease Factor Updates', () => {
    const reviewSchedule: CardSchedule = {
      due: fixedDate,
      interval: 10,
      easeFactor: 2.5,
      repetitions: 3,
      state: 'review',
      learningStep: 0,
    }

    it('should decrease ease factor on Again', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Again, fixedDate)
      expect(result.easeFactor).toBeLessThan(2.5)
    })

    it('should decrease ease factor on Hard', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Hard, fixedDate)
      expect(result.easeFactor).toBeLessThan(2.5)
    })

    it('should not change ease factor much on Good', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Good, fixedDate)
      expect(result.easeFactor).toBe(2.5)
    })

    it('should increase ease factor on Easy', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Easy, fixedDate)
      expect(result.easeFactor).toBeGreaterThan(2.5)
    })

    it('should not let ease factor go below 1.3', () => {
      const lowEaseSchedule: CardSchedule = {
        ...reviewSchedule,
        easeFactor: 1.35,
      }
      const result = calculateNextReview(lowEaseSchedule, Ease.Again, fixedDate)
      expect(result.easeFactor).toBeGreaterThanOrEqual(1.3)
    })
  })

  describe('getNextIntervalPreview', () => {
    it('should return preview strings for all ease options', () => {
      const schedule: CardSchedule = {
        due: fixedDate,
        interval: 10,
        easeFactor: 2.5,
        repetitions: 3,
        state: 'review',
        learningStep: 0,
      }

      const previews = getNextIntervalPreview(schedule, fixedDate)

      expect(previews[Ease.Again]).toBeDefined()
      expect(previews[Ease.Hard]).toBeDefined()
      expect(previews[Ease.Good]).toBeDefined()
      expect(previews[Ease.Easy]).toBeDefined()
    })
  })
})
