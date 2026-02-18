/**
 * Tests for sync orchestration logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database module
vi.mock('./schema', () => ({
  db: {
    cardStates: {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
        })),
      })),
    },
    reviewLogs: {
      add: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
        })),
        anyOf: vi.fn(() => ({
          modify: vi.fn().mockResolvedValue(0),
        })),
      })),
    },
    syncQueue: {
      add: vi.fn().mockResolvedValue(1),
      get: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      where: vi.fn(() => ({
        below: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(0),
          limit: vi.fn(() => ({
            sortBy: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
      bulkDelete: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
    syncMetadata: {
      get: vi.fn(),
      put: vi.fn().mockResolvedValue(undefined),
    },
    transaction: vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<void>) => fn()),
  },
  getSyncMeta: vi.fn().mockResolvedValue(null),
  setSyncMeta: vi.fn().mockResolvedValue(undefined),
  markReviewLogsSynced: vi.fn().mockResolvedValue(undefined),
  getCardState: vi.fn(),
}))

vi.mock('./utils', () => ({
  isOnline: vi.fn().mockReturnValue(true),
  formatForServer: vi.fn((date: Date) => date.toISOString()),
  parseServerDate: vi.fn((str: string) => new Date(str)),
}))

vi.mock('./sync-queue', () => ({
  getPendingSyncCount: vi.fn().mockResolvedValue(0),
  processSyncQueue: vi.fn().mockResolvedValue({ processed: 0, failed: 0 }),
  groupEntriesByTable: vi.fn().mockReturnValue(new Map()),
}))

vi.mock('./conflict', () => ({
  detectConflicts: vi.fn().mockReturnValue([]),
}))

// Mock fetch
global.fetch = vi.fn()

import { getSyncStatus, initSync, undoAnswerLocally, saveAnswerLocally } from './sync'
import { isOnline } from './utils'
import { getPendingSyncCount } from './sync-queue'
import { getSyncMeta, db } from './schema'
import type { LocalCardState } from './schema'

describe('Sync Status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSyncStatus', () => {
    it('should return initial sync status', () => {
      const status = getSyncStatus()

      expect(status).toHaveProperty('isOnline')
      expect(status).toHaveProperty('isSyncing')
      expect(status).toHaveProperty('pendingCount')
      expect(status).toHaveProperty('lastSyncAt')
      expect(status).toHaveProperty('conflicts')
      expect(status).toHaveProperty('error')
    })

    it('should return a copy of the status object', () => {
      const status1 = getSyncStatus()
      const status2 = getSyncStatus()

      expect(status1).not.toBe(status2)
      expect(status1).toEqual(status2)
    })
  })

  describe('initSync', () => {
    it('should initialize sync status from stored values', async () => {
      vi.mocked(getPendingSyncCount).mockResolvedValue(5)
      vi.mocked(getSyncMeta).mockResolvedValue('2024-01-15T10:00:00Z')
      vi.mocked(isOnline).mockReturnValue(true)

      await initSync()

      const status = getSyncStatus()
      expect(status.pendingCount).toBe(5)
      expect(status.isOnline).toBe(true)
    })

    it('should handle null lastSyncAt', async () => {
      vi.mocked(getPendingSyncCount).mockResolvedValue(0)
      vi.mocked(getSyncMeta).mockResolvedValue(null)

      await initSync()

      const status = getSyncStatus()
      expect(status.lastSyncAt).toBeNull()
    })
  })
})

describe('Sync Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    } as Response)
  })

  // Note: More comprehensive tests would require setting up the full mock infrastructure
  // These tests verify the basic structure and error handling

  it('should handle offline state', async () => {
    vi.mocked(isOnline).mockReturnValue(false)

    await initSync()
    const status = getSyncStatus()

    expect(status.isOnline).toBe(false)
  })
})

describe('undoAnswerLocally', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(db.syncQueue.toArray).mockResolvedValue([])
  })

  it('should restore existing card_state when previousCardState is provided', async () => {
    const previousState: LocalCardState = {
      id: 'user1:card1',
      user_id: 'user1',
      card_id: 'card1',
      due: new Date('2024-01-15T10:00:00Z'),
      interval: 5,
      ease_factor: 2.5,
      repetitions: 3,
      state: 'review',
      learning_step: 0,
      lapses: 0,
      stability: null,
      difficulty: null,
      elapsed_days: 0,
      scheduled_days: 0,
      last_review: null,
      updated_at: new Date('2024-01-10T10:00:00Z'),
    }

    await undoAnswerLocally('user1', 'card1', 'review-log-1', previousState)

    expect(db.cardStates.put).toHaveBeenCalledWith(previousState)
    expect(db.reviewLogs.delete).toHaveBeenCalledWith('review-log-1')
  })

  it('should delete card_state when previousCardState is null (new card)', async () => {
    await undoAnswerLocally('user1', 'card1', 'review-log-1', null)

    expect(db.cardStates.delete).toHaveBeenCalledWith('user1:card1')
    expect(db.cardStates.put).not.toHaveBeenCalled()
    expect(db.reviewLogs.delete).toHaveBeenCalledWith('review-log-1')
  })

  it('should remove matching sync_queue entries', async () => {
    vi.mocked(db.syncQueue.toArray).mockResolvedValue([
      { id: 1, table: 'card_states', operation: 'upsert', record_id: 'user1:card1', payload: {}, created_at: new Date(), attempts: 0 },
      { id: 2, table: 'review_logs', operation: 'upsert', record_id: 'review-log-1', payload: {}, created_at: new Date(), attempts: 0 },
      { id: 3, table: 'card_states', operation: 'upsert', record_id: 'user1:card2', payload: {}, created_at: new Date(), attempts: 0 },
    ])

    await undoAnswerLocally('user1', 'card1', 'review-log-1', null)

    expect(db.syncQueue.bulkDelete).toHaveBeenCalledWith([1, 2])
  })

  it('should add compensation sync_queue entry when restoring previous state', async () => {
    const previousState: LocalCardState = {
      id: 'user1:card1',
      user_id: 'user1',
      card_id: 'card1',
      due: new Date('2024-01-15T10:00:00Z'),
      interval: 5,
      ease_factor: 2.5,
      repetitions: 3,
      state: 'review',
      learning_step: 0,
      lapses: 1,
      stability: null,
      difficulty: null,
      elapsed_days: 0,
      scheduled_days: 0,
      last_review: null,
      updated_at: new Date('2024-01-10T10:00:00Z'),
    }

    await undoAnswerLocally('user1', 'card1', 'review-log-1', previousState)

    // Check that a compensation entry was added
    expect(db.syncQueue.add).toHaveBeenCalledWith(
      expect.objectContaining({
        table: 'card_states',
        operation: 'upsert',
        record_id: 'user1:card1',
        payload: expect.objectContaining({
          user_id: 'user1',
          card_id: 'card1',
          interval: 5,
          ease_factor: 2.5,
          repetitions: 3,
          state: 'review',
          learning_step: 0,
          lapses: 1,
        }),
      })
    )
  })

  it('should NOT add compensation sync_queue entry when card was new', async () => {
    await undoAnswerLocally('user1', 'card1', 'review-log-1', null)

    expect(db.syncQueue.add).not.toHaveBeenCalled()
  })
})

describe('saveAnswerLocally', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should use provided reviewLogId when given', async () => {
    const customId = 'custom-review-log-id'

    await saveAnswerLocally(
      'user1',
      'card1',
      3,
      {
        due: new Date('2024-01-20T10:00:00Z'),
        interval: 10,
        easeFactor: 2.6,
        repetitions: 4,
        state: 'review',
        learningStep: 0,
        lapses: 0,
      },
      5,
      1000,
      customId
    )

    expect(db.reviewLogs.add).toHaveBeenCalledWith(
      expect.objectContaining({ id: customId })
    )
    // Check sync queue also uses the custom ID
    expect(db.syncQueue.add).toHaveBeenCalledWith(
      expect.objectContaining({
        table: 'review_logs',
        record_id: customId,
        payload: expect.objectContaining({ id: customId }),
      })
    )
  })
})
