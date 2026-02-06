import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CardSchedule,
  Ease,
  calculateNextReview,
  createInitialSchedule,
  isDue,
  getStudyDayStart,
  getNextIntervalPreview,
  getDefaultDeckSettings,
  resolveDeckSettings,
  checkLeech,
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
      expect(schedule.lapses).toBe(0)
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
      lapses: 0,
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
      lapses: 0,
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
      lapses: 0,
    }

    it('should lapse to relearning on Again', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Again, fixedDate)
      expect(result.state).toBe('relearning')
      expect(result.learningStep).toBe(0)
      // Interval should be halved
      expect(result.interval).toBe(5)
      expect(result.lapses).toBe(1)
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
      lapses: 0,
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
        lapses: 0,
      }

      const previews = getNextIntervalPreview(schedule, fixedDate)

      expect(previews[Ease.Again]).toBeDefined()
      expect(previews[Ease.Hard]).toBeDefined()
      expect(previews[Ease.Good]).toBeDefined()
      expect(previews[Ease.Easy]).toBeDefined()
    })
  })

  // ====== Custom DeckSettings tests ======

  describe('getDefaultDeckSettings / resolveDeckSettings', () => {
    it('should return complete default settings', () => {
      const defaults = getDefaultDeckSettings()
      expect(defaults.new_cards_per_day).toBe(20)
      expect(defaults.learning_steps).toEqual([1, 10])
      expect(defaults.graduating_interval).toBe(1)
      expect(defaults.easy_interval).toBe(4)
      expect(defaults.max_interval).toBe(36500)
      expect(defaults.leech_threshold).toBe(8)
    })

    it('should merge partial settings with defaults', () => {
      const resolved = resolveDeckSettings({ learning_steps: [1, 5, 15], max_interval: 180 })
      expect(resolved.learning_steps).toEqual([1, 5, 15])
      expect(resolved.max_interval).toBe(180)
      expect(resolved.graduating_interval).toBe(1) // default
    })

    it('should return defaults when undefined is passed', () => {
      const resolved = resolveDeckSettings(undefined)
      expect(resolved).toEqual(getDefaultDeckSettings())
    })
  })

  describe('Custom learning_steps', () => {
    const newSchedule: CardSchedule = {
      due: fixedDate,
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      state: 'new',
      learningStep: 0,
      lapses: 0,
    }

    it('should use custom learning steps [1, 5, 15]', () => {
      const settings = { learning_steps: [1, 5, 15] }

      // Step 0 -> Step 1 (Good)
      const result1 = calculateNextReview(newSchedule, Ease.Good, fixedDate, settings)
      expect(result1.state).toBe('learning')
      expect(result1.learningStep).toBe(1)
      expect(result1.due.getTime() - fixedDate.getTime()).toBe(5 * 60 * 1000)

      // Step 1 -> Step 2 (Good)
      const result2 = calculateNextReview(result1, Ease.Good, fixedDate, settings)
      expect(result2.state).toBe('learning')
      expect(result2.learningStep).toBe(2)
      expect(result2.due.getTime() - fixedDate.getTime()).toBe(15 * 60 * 1000)

      // Step 2 -> Graduate (Good)
      const result3 = calculateNextReview(result2, Ease.Good, fixedDate, settings)
      expect(result3.state).toBe('review')
    })
  })

  describe('Custom graduating_interval / easy_interval', () => {
    const learningLastStep: CardSchedule = {
      due: fixedDate,
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      state: 'learning',
      learningStep: 1,
      lapses: 0,
    }

    it('should use custom graduating_interval', () => {
      const result = calculateNextReview(learningLastStep, Ease.Good, fixedDate, { graduating_interval: 3 })
      expect(result.state).toBe('review')
      expect(result.interval).toBe(3)
    })

    it('should use custom easy_interval', () => {
      const result = calculateNextReview(learningLastStep, Ease.Easy, fixedDate, { easy_interval: 7 })
      expect(result.state).toBe('review')
      expect(result.interval).toBe(7)
    })
  })

  describe('interval_modifier', () => {
    const reviewSchedule: CardSchedule = {
      due: fixedDate,
      interval: 10,
      easeFactor: 2.5,
      repetitions: 3,
      state: 'review',
      learningStep: 0,
      lapses: 0,
    }

    it('should halve intervals with interval_modifier = 0.5', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Good, fixedDate, { interval_modifier: 0.5 })
      // 10 * 2.5 * 0.5 = 12.5 → 13
      expect(result.interval).toBe(13)
    })

    it('should double intervals with interval_modifier = 2.0', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Good, fixedDate, { interval_modifier: 2.0 })
      // 10 * 2.5 * 2.0 = 50
      expect(result.interval).toBe(50)
    })
  })

  describe('max_interval', () => {
    const reviewSchedule: CardSchedule = {
      due: fixedDate,
      interval: 500,
      easeFactor: 2.5,
      repetitions: 10,
      state: 'review',
      learningStep: 0,
      lapses: 0,
    }

    it('should clamp interval to max_interval', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Good, fixedDate, { max_interval: 365 })
      // 500 * 2.5 = 1250, clamped to 365
      expect(result.interval).toBe(365)
    })
  })

  describe('easy_bonus / hard_interval_modifier', () => {
    const reviewSchedule: CardSchedule = {
      due: fixedDate,
      interval: 10,
      easeFactor: 2.5,
      repetitions: 3,
      state: 'review',
      learningStep: 0,
      lapses: 0,
    }

    it('should use custom easy_bonus', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Easy, fixedDate, { easy_bonus: 2.0 })
      // EF after Easy: 2.5 + 0.15 = 2.65, but 2.6 after rounding effects
      // 10 * newEF * 2.0 = 10 * 2.6 * 2.0 = 52
      expect(result.interval).toBe(52)
    })

    it('should use custom hard_interval_modifier', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Hard, fixedDate, { hard_interval_modifier: 0.8 })
      // 10 * 0.8 = 8
      expect(result.interval).toBe(8)
    })
  })

  describe('lapse_new_interval / lapse_min_interval', () => {
    const reviewSchedule: CardSchedule = {
      due: fixedDate,
      interval: 20,
      easeFactor: 2.5,
      repetitions: 5,
      state: 'review',
      learningStep: 0,
      lapses: 2,
    }

    it('should use custom lapse_new_interval', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Again, fixedDate, { lapse_new_interval: 0.2 })
      // 20 * 0.2 = 4
      expect(result.interval).toBe(4)
      expect(result.lapses).toBe(3)
    })

    it('should respect lapse_min_interval', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Again, fixedDate, { lapse_new_interval: 0.0, lapse_min_interval: 3 })
      // 20 * 0.0 = 0, but min is 3
      expect(result.interval).toBe(3)
    })

    it('should use custom relearning_steps', () => {
      const result = calculateNextReview(reviewSchedule, Ease.Again, fixedDate, { relearning_steps: [5, 30] })
      expect(result.state).toBe('relearning')
      expect(result.due.getTime() - fixedDate.getTime()).toBe(5 * 60 * 1000)
    })
  })

  describe('Leech detection', () => {
    it('should detect leech at threshold', () => {
      const settings = resolveDeckSettings({ leech_threshold: 3 })
      const schedule: CardSchedule = {
        due: fixedDate,
        interval: 5,
        easeFactor: 2.0,
        repetitions: 1,
        state: 'review',
        learningStep: 0,
        lapses: 2,
      }

      // Lapse #3 triggers leech (at threshold)
      const result = calculateNextReview(schedule, Ease.Again, fixedDate, { leech_threshold: 3 })
      expect(result.lapses).toBe(3)
      expect(checkLeech(result, settings)).toBe(true)
    })

    it('should not detect leech below threshold', () => {
      const settings = resolveDeckSettings({ leech_threshold: 3 })
      const schedule: CardSchedule = {
        ...createInitialSchedule(),
        lapses: 1,
      }
      expect(checkLeech(schedule, settings)).toBe(false)
    })

    it('should not detect leech when threshold is 0 (disabled)', () => {
      const settings = resolveDeckSettings({ leech_threshold: 0 })
      const schedule: CardSchedule = {
        ...createInitialSchedule(),
        lapses: 100,
      }
      expect(checkLeech(schedule, settings)).toBe(false)
    })

    it('should re-detect leech at threshold intervals', () => {
      const settings = resolveDeckSettings({ leech_threshold: 4 })
      // Re-triggers every threshold/2 = 2 lapses after threshold
      const schedule4: CardSchedule = { ...createInitialSchedule(), lapses: 4 }
      const schedule6: CardSchedule = { ...createInitialSchedule(), lapses: 6 }
      const schedule5: CardSchedule = { ...createInitialSchedule(), lapses: 5 }

      expect(checkLeech(schedule4, settings)).toBe(true)  // 4 % 2 === 0
      expect(checkLeech(schedule6, settings)).toBe(true)  // 6 % 2 === 0
      expect(checkLeech(schedule5, settings)).toBe(false) // 5 % 2 !== 0
    })
  })

  describe('getNextIntervalPreview with settings', () => {
    it('should respect settings in preview', () => {
      const schedule: CardSchedule = {
        due: fixedDate,
        interval: 10,
        easeFactor: 2.5,
        repetitions: 3,
        state: 'review',
        learningStep: 0,
        lapses: 0,
      }

      const previews = getNextIntervalPreview(schedule, fixedDate, { max_interval: 15 })
      // Good: 10 * 2.5 = 25, clamped to 15 → "15日"
      expect(previews[Ease.Good]).toBe('15日')
    })
  })
})
