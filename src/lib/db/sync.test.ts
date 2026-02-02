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
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
        })),
      })),
    },
    reviewLogs: {
      add: vi.fn().mockResolvedValue(undefined),
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
    transaction: vi.fn(async (_mode, _tables, fn) => fn()),
  },
  getSyncMeta: vi.fn().mockResolvedValue(null),
  setSyncMeta: vi.fn().mockResolvedValue(undefined),
  markReviewLogsSynced: vi.fn().mockResolvedValue(undefined),
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

import { getSyncStatus, initSync } from './sync'
import { isOnline } from './utils'
import { getPendingSyncCount } from './sync-queue'
import { getSyncMeta } from './schema'

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
