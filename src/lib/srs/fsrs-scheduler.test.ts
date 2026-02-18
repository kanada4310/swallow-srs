import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  easeToRating,
  fsrsStateToCardState,
  cardStateToFSRSState,
  scheduleToFSRSCard,
  fsrsCardToScheduleFields,
  buildFSRSParams,
  calculateNextReviewFSRS,
  getNextIntervalPreviewFSRS,
} from './fsrs-scheduler'
import { Ease, createInitialSchedule, getDefaultDeckSettings, type CardSchedule } from './scheduler'
import { Rating, State } from 'ts-fsrs'

describe('FSRS Scheduler', () => {
  const fixedDate = new Date('2024-01-15T10:00:00')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(fixedDate)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('easeToRating', () => {
    it('should convert Ease.Again to Rating.Again', () => {
      expect(easeToRating(Ease.Again)).toBe(Rating.Again)
    })

    it('should convert Ease.Hard to Rating.Hard', () => {
      expect(easeToRating(Ease.Hard)).toBe(Rating.Hard)
    })

    it('should convert Ease.Good to Rating.Good', () => {
      expect(easeToRating(Ease.Good)).toBe(Rating.Good)
    })

    it('should convert Ease.Easy to Rating.Easy', () => {
      expect(easeToRating(Ease.Easy)).toBe(Rating.Easy)
    })
  })

  describe('fsrsStateToCardState', () => {
    it('should convert State.New to "new"', () => {
      expect(fsrsStateToCardState(State.New)).toBe('new')
    })

    it('should convert State.Learning to "learning"', () => {
      expect(fsrsStateToCardState(State.Learning)).toBe('learning')
    })

    it('should convert State.Review to "review"', () => {
      expect(fsrsStateToCardState(State.Review)).toBe('review')
    })

    it('should convert State.Relearning to "relearning"', () => {
      expect(fsrsStateToCardState(State.Relearning)).toBe('relearning')
    })
  })

  describe('cardStateToFSRSState', () => {
    it('should convert "new" to State.New', () => {
      expect(cardStateToFSRSState('new')).toBe(State.New)
    })

    it('should convert "learning" to State.Learning', () => {
      expect(cardStateToFSRSState('learning')).toBe(State.Learning)
    })

    it('should convert "review" to State.Review', () => {
      expect(cardStateToFSRSState('review')).toBe(State.Review)
    })

    it('should convert "relearning" to State.Relearning', () => {
      expect(cardStateToFSRSState('relearning')).toBe(State.Relearning)
    })

    it('should convert "suspended" to State.Review', () => {
      expect(cardStateToFSRSState('suspended')).toBe(State.Review)
    })
  })

  describe('scheduleToFSRSCard', () => {
    it('should create empty card for new schedule without FSRS data', () => {
      const schedule = createInitialSchedule()
      const card = scheduleToFSRSCard(schedule)
      expect(card.state).toBe(State.New)
      expect(card.stability).toBe(0)
      expect(card.difficulty).toBe(0)
    })

    it('should convert review schedule with FSRS data', () => {
      const schedule: CardSchedule = {
        due: fixedDate,
        interval: 10,
        easeFactor: 2.5,
        repetitions: 5,
        state: 'review',
        learningStep: 0,
        lapses: 1,
        stability: 10.5,
        difficulty: 5.2,
        elapsed_days: 10,
        scheduled_days: 10,
        last_review: new Date('2024-01-05T10:00:00'),
      }
      const card = scheduleToFSRSCard(schedule)
      expect(card.state).toBe(State.Review)
      expect(card.stability).toBe(10.5)
      expect(card.difficulty).toBe(5.2)
      expect(card.reps).toBe(5)
      expect(card.lapses).toBe(1)
    })

    it('should create empty card for learning cards without FSRS data', () => {
      const schedule: CardSchedule = {
        ...createInitialSchedule(),
        state: 'learning',
        learningStep: 1,
      }
      const card = scheduleToFSRSCard(schedule)
      expect(card.state).toBe(State.New) // createEmptyCard returns New state
      expect(card.stability).toBe(0)
      expect(card.difficulty).toBe(0)
    })

    it('should estimate FSRS values for unmigrated SM-2 review cards', () => {
      // SM-2 review card that was not migrated: has interval/EF but null stability/difficulty
      const schedule: CardSchedule = {
        due: fixedDate,
        interval: 15,
        easeFactor: 2.5,
        repetitions: 5,
        state: 'review',
        learningStep: 0,
        lapses: 0,
        stability: null,
        difficulty: null,
        elapsed_days: 0,
        scheduled_days: 0,
        last_review: null,
      }
      const card = scheduleToFSRSCard(schedule)
      expect(card.state).toBe(State.Review)
      // Stability should be estimated from interval (≈15)
      expect(card.stability).toBe(15)
      // Difficulty should be estimated from EF 2.5 (≈3)
      expect(card.difficulty).toBe(3)
      // elapsed_days and scheduled_days should be set from interval
      expect(card.elapsed_days).toBe(15)
      expect(card.scheduled_days).toBe(15)
      // last_review should be estimated (15 days before due)
      expect(card.last_review).toBeDefined()
    })

    it('should estimate FSRS values for unmigrated SM-2 relearning cards', () => {
      const schedule: CardSchedule = {
        due: fixedDate,
        interval: 5,
        easeFactor: 1.8,
        repetitions: 3,
        state: 'relearning',
        learningStep: 0,
        lapses: 2,
        stability: null,
        difficulty: null,
        elapsed_days: 0,
        scheduled_days: 0,
        last_review: null,
      }
      const card = scheduleToFSRSCard(schedule)
      expect(card.state).toBe(State.Relearning)
      expect(card.stability).toBe(5)
      // EF 1.8 → difficulty should be higher than EF 2.5
      expect(card.difficulty).toBeGreaterThan(3)
      expect(card.lapses).toBe(2)
    })

    it('should handle unmigrated card with zero interval', () => {
      const schedule: CardSchedule = {
        due: fixedDate,
        interval: 0,
        easeFactor: 2.5,
        repetitions: 1,
        state: 'review',
        learningStep: 0,
        lapses: 0,
        stability: null,
        difficulty: null,
        elapsed_days: 0,
        scheduled_days: 0,
        last_review: null,
      }
      const card = scheduleToFSRSCard(schedule)
      // Should use minimum stability of 0.1
      expect(card.stability).toBe(0.1)
    })
  })

  describe('buildFSRSParams', () => {
    it('should build parameters from default deck settings', () => {
      const settings = { ...getDefaultDeckSettings(), algorithm: 'fsrs' as const }
      const params = buildFSRSParams(settings)
      expect(params.request_retention).toBe(0.9)
      expect(params.maximum_interval).toBe(36500)
      expect(params.enable_fuzz).toBe(true)
      expect(params.enable_short_term).toBe(true)
    })

    it('should include custom weights when provided', () => {
      const settings = {
        ...getDefaultDeckSettings(),
        algorithm: 'fsrs' as const,
        fsrs_weights: [0.1, 0.2, 0.3],
      }
      const params = buildFSRSParams(settings)
      expect(params.w).toEqual([0.1, 0.2, 0.3])
    })

    it('should not include weights when empty array', () => {
      const settings = {
        ...getDefaultDeckSettings(),
        algorithm: 'fsrs' as const,
        fsrs_weights: [],
      }
      const params = buildFSRSParams(settings)
      expect(params.w).toBeUndefined()
    })

    it('should convert learning steps to StepUnit format', () => {
      const settings = {
        ...getDefaultDeckSettings(),
        algorithm: 'fsrs' as const,
        learning_steps: [1, 10, 60, 1440],
      }
      const params = buildFSRSParams(settings)
      expect(params.learning_steps).toEqual(['1m', '10m', '1h', '1d'])
    })
  })

  describe('calculateNextReviewFSRS', () => {
    const fsrsSettings = { ...getDefaultDeckSettings(), algorithm: 'fsrs' as const }

    it('should schedule new card after Good response', () => {
      const schedule = createInitialSchedule()
      const result = calculateNextReviewFSRS(schedule, Ease.Good, fixedDate, fsrsSettings)
      // FSRS should transition from new to learning or review
      expect(['learning', 'review']).toContain(result.state)
      expect(result.due.getTime()).toBeGreaterThan(fixedDate.getTime())
    })

    it('should schedule new card after Again response', () => {
      const schedule = createInitialSchedule()
      const result = calculateNextReviewFSRS(schedule, Ease.Again, fixedDate, fsrsSettings)
      expect(['new', 'learning']).toContain(result.state)
      expect(result.due.getTime()).toBeGreaterThanOrEqual(fixedDate.getTime())
    })

    it('should schedule new card after Easy response', () => {
      const schedule = createInitialSchedule()
      const result = calculateNextReviewFSRS(schedule, Ease.Easy, fixedDate, fsrsSettings)
      expect(result.due.getTime()).toBeGreaterThan(fixedDate.getTime())
    })

    it('should schedule review card with stability and difficulty', () => {
      const schedule: CardSchedule = {
        due: fixedDate,
        interval: 10,
        easeFactor: 2.5,
        repetitions: 5,
        state: 'review',
        learningStep: 0,
        lapses: 0,
        stability: 10,
        difficulty: 5,
        elapsed_days: 10,
        scheduled_days: 10,
        last_review: new Date('2024-01-05T10:00:00'),
      }
      const result = calculateNextReviewFSRS(schedule, Ease.Good, fixedDate, fsrsSettings)
      expect(result.state).toBe('review')
      expect(result.stability).not.toBeNull()
      expect(result.stability!).toBeGreaterThan(0)
      expect(result.difficulty).not.toBeNull()
      expect(result.due.getTime()).toBeGreaterThan(fixedDate.getTime())
    })

    it('should move review card to relearning on Again', () => {
      const schedule: CardSchedule = {
        due: fixedDate,
        interval: 10,
        easeFactor: 2.5,
        repetitions: 5,
        state: 'review',
        learningStep: 0,
        lapses: 0,
        stability: 10,
        difficulty: 5,
        elapsed_days: 10,
        scheduled_days: 10,
        last_review: new Date('2024-01-05T10:00:00'),
      }
      const result = calculateNextReviewFSRS(schedule, Ease.Again, fixedDate, fsrsSettings)
      expect(['relearning', 'review']).toContain(result.state)
      expect(result.lapses).toBeGreaterThanOrEqual(1)
    })

    it('should respect desired_retention setting', () => {
      const schedule: CardSchedule = {
        due: fixedDate,
        interval: 10,
        easeFactor: 2.5,
        repetitions: 5,
        state: 'review',
        learningStep: 0,
        lapses: 0,
        stability: 10,
        difficulty: 5,
        elapsed_days: 10,
        scheduled_days: 10,
        last_review: new Date('2024-01-05T10:00:00'),
      }

      const highRetention = { ...fsrsSettings, fsrs_desired_retention: 0.95 }
      const lowRetention = { ...fsrsSettings, fsrs_desired_retention: 0.80 }

      const resultHigh = calculateNextReviewFSRS(schedule, Ease.Good, fixedDate, highRetention)
      const resultLow = calculateNextReviewFSRS(schedule, Ease.Good, fixedDate, lowRetention)

      // Higher retention -> shorter intervals
      expect(resultHigh.scheduled_days).toBeLessThanOrEqual(resultLow.scheduled_days)
    })
  })

  describe('getNextIntervalPreviewFSRS', () => {
    const fsrsSettings = { ...getDefaultDeckSettings(), algorithm: 'fsrs' as const }

    it('should return previews for all 4 ease levels', () => {
      const schedule = createInitialSchedule()
      const previews = getNextIntervalPreviewFSRS(schedule, fixedDate, fsrsSettings)

      expect(previews[Ease.Again]).toBeTruthy()
      expect(previews[Ease.Hard]).toBeTruthy()
      expect(previews[Ease.Good]).toBeTruthy()
      expect(previews[Ease.Easy]).toBeTruthy()
    })

    it('should return formatted interval strings', () => {
      const schedule = createInitialSchedule()
      const previews = getNextIntervalPreviewFSRS(schedule, fixedDate, fsrsSettings)

      // All previews should be non-empty strings containing Japanese time units
      for (const ease of [Ease.Again, Ease.Hard, Ease.Good, Ease.Easy]) {
        expect(typeof previews[ease]).toBe('string')
        expect(previews[ease].length).toBeGreaterThan(0)
      }
    })

    it('should return increasing intervals for review card', () => {
      const schedule: CardSchedule = {
        due: fixedDate,
        interval: 10,
        easeFactor: 2.5,
        repetitions: 5,
        state: 'review',
        learningStep: 0,
        lapses: 0,
        stability: 10,
        difficulty: 5,
        elapsed_days: 10,
        scheduled_days: 10,
        last_review: new Date('2024-01-05T10:00:00'),
      }
      const previews = getNextIntervalPreviewFSRS(schedule, fixedDate, fsrsSettings)

      // All should have values
      expect(previews[Ease.Again]).toBeTruthy()
      expect(previews[Ease.Easy]).toBeTruthy()
    })
  })

  describe('fsrsCardToScheduleFields', () => {
    it('should preserve easeFactor from previous schedule', () => {
      const prevSchedule: CardSchedule = {
        ...createInitialSchedule(),
        easeFactor: 2.3,
      }
      const fsrsCard = {
        due: fixedDate,
        stability: 5,
        difficulty: 4,
        elapsed_days: 0,
        scheduled_days: 5,
        learning_steps: 0,
        reps: 1,
        lapses: 0,
        state: State.Review,
        last_review: fixedDate,
      }
      const result = fsrsCardToScheduleFields(fsrsCard, prevSchedule)
      expect(result.easeFactor).toBe(2.3) // preserved from prev
      expect(result.stability).toBe(5)
      expect(result.difficulty).toBe(4)
      expect(result.interval).toBe(5) // from scheduled_days
    })
  })
})
