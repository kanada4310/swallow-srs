/**
 * Tests for Dexie.js schema and database operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createCardStateId,
  generateId,
  savePracticeReviewLog,
  db,
} from './schema'

// Mock IndexedDB
vi.mock('dexie', () => {
  const mockTable = {
    get: vi.fn(),
    put: vi.fn(),
    add: vi.fn(),
    delete: vi.fn(),
    bulkPut: vi.fn(),
    bulkDelete: vi.fn(),
    where: vi.fn(() => ({
      equals: vi.fn(() => ({
        filter: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
        })),
        toArray: vi.fn().mockResolvedValue([]),
        modify: vi.fn().mockResolvedValue(0),
      })),
      anyOf: vi.fn(() => ({
        modify: vi.fn().mockResolvedValue(0),
      })),
      below: vi.fn(() => ({
        limit: vi.fn(() => ({
          sortBy: vi.fn().mockResolvedValue([]),
        })),
        count: vi.fn().mockResolvedValue(0),
      })),
      aboveOrEqual: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([]),
      })),
    })),
    clear: vi.fn().mockResolvedValue(undefined),
    filter: vi.fn(() => ({
      toArray: vi.fn().mockResolvedValue([]),
    })),
  }

  class MockDexie {
    version() {
      const versionObj = {
        stores: vi.fn(() => versionObj),
        upgrade: vi.fn(() => versionObj),
      }
      return versionObj
    }
    transaction = vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<void>) => fn())
    profiles = mockTable
    noteTypes = mockTable
    cardTemplates = mockTable
    decks = mockTable
    notes = mockTable
    cards = mockTable
    cardStates = mockTable
    reviewLogs = mockTable
    syncQueue = mockTable
    syncMetadata = mockTable
    open = vi.fn().mockResolvedValue(undefined)
  }

  return {
    default: MockDexie,
  }
})

describe('Schema utilities', () => {
  describe('createCardStateId', () => {
    it('should create a composite key from userId and cardId', () => {
      const userId = 'user-123'
      const cardId = 'card-456'
      const id = createCardStateId(userId, cardId)
      expect(id).toBe('user-123:card-456')
    })

    it('should handle UUIDs', () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000'
      const cardId = '660e8400-e29b-41d4-a716-446655440001'
      const id = createCardStateId(userId, cardId)
      expect(id).toBe('550e8400-e29b-41d4-a716-446655440000:660e8400-e29b-41d4-a716-446655440001')
    })
  })

  describe('generateId', () => {
    it('should generate a valid UUID', () => {
      const id = generateId()
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    })

    it('should generate unique IDs', () => {
      const id1 = generateId()
      const id2 = generateId()
      expect(id1).not.toBe(id2)
    })
  })
})

describe('LocalCardState', () => {
  it('should have the correct structure', () => {
    const state = {
      id: 'user:card',
      user_id: 'user',
      card_id: 'card',
      due: new Date(),
      interval: 1,
      ease_factor: 2.5,
      repetitions: 1,
      state: 'review' as const,
      learning_step: 0,
      updated_at: new Date(),
    }

    expect(state.id).toBe('user:card')
    expect(state.state).toBe('review')
    expect(state.ease_factor).toBe(2.5)
  })
})

describe('savePracticeReviewLog', () => {
  beforeEach(() => {
    vi.mocked(db.reviewLogs.put).mockClear()
  })

  it('practice フラグを付け、reviewed_at で同期不要扱いにする（サーバーへ漏らさない）', async () => {
    const reviewedAt = new Date('2026-07-07T05:00:00Z')
    await savePracticeReviewLog({
      id: 'log-1',
      user_id: 'u1',
      card_id: 'c1',
      deck_id: 'd1',
      ease: 3,
      interval: 0,
      last_interval: 0,
      time_ms: 1200,
      reviewed_at: reviewedAt,
      score: null,
      step_results: null,
    })

    expect(db.reviewLogs.put).toHaveBeenCalledTimes(1)
    const saved = vi.mocked(db.reviewLogs.put).mock.calls[0][0]
    expect(saved.practice).toBe(true)
    // synced_at が null でない = getUnsyncedReviewLogs に拾われない
    expect(saved.synced_at).toEqual(reviewedAt)
    expect(saved.card_id).toBe('c1')
  })
})

describe('SyncQueueEntry', () => {
  it('should have the correct structure', () => {
    const entry = {
      id: 1,
      table: 'card_states' as const,
      operation: 'upsert' as const,
      record_id: 'user:card',
      payload: { due: '2024-01-15T10:00:00Z' },
      created_at: new Date(),
      attempts: 0,
    }

    expect(entry.table).toBe('card_states')
    expect(entry.operation).toBe('upsert')
    expect(entry.attempts).toBe(0)
  })
})
