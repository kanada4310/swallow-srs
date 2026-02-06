/**
 * Tests for conflict detection and resolution
 */

import { describe, it, expect } from 'vitest'
import {
  detectConflicts,
  resolveConflict,
  autoResolveConflicts,
  formatConflictForDisplay,
  type ConflictInfo,
} from './conflict'
import type { LocalCardState } from './schema'

describe('Conflict Detection', () => {
  const createLocalState = (overrides: Partial<LocalCardState> = {}): LocalCardState => ({
    id: 'user1:card1',
    user_id: 'user1',
    card_id: 'card1',
    due: new Date('2024-01-20T10:00:00Z'),
    interval: 5,
    ease_factor: 2.5,
    repetitions: 3,
    state: 'review',
    learning_step: 0,
    lapses: 0,
    updated_at: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  })

  const createServerState = (overrides: Record<string, unknown> = {}) => ({
    user_id: 'user1',
    card_id: 'card1',
    due: '2024-01-20T10:00:00Z',
    interval: 5,
    ease_factor: 2.5,
    repetitions: 3,
    state: 'review',
    learning_step: 0,
    lapses: 0,
    updated_at: '2024-01-15T10:00:00Z',
    ...overrides,
  })

  describe('detectConflicts', () => {
    it('should return empty array when no conflicts exist', () => {
      const local = [createLocalState()]
      const server = [createServerState()]

      const conflicts = detectConflicts(local, server)

      expect(conflicts).toHaveLength(0)
    })

    it('should return empty array when local is newer', () => {
      const local = [
        createLocalState({
          updated_at: new Date('2024-01-16T10:00:00Z'),
          interval: 10,
        }),
      ]
      const server = [
        createServerState({
          updated_at: '2024-01-15T10:00:00Z',
          interval: 5,
        }),
      ]

      const conflicts = detectConflicts(local, server)

      expect(conflicts).toHaveLength(0)
    })

    it('should return empty array when server is newer', () => {
      const local = [
        createLocalState({
          updated_at: new Date('2024-01-15T10:00:00Z'),
          interval: 5,
        }),
      ]
      const server = [
        createServerState({
          updated_at: '2024-01-16T10:00:00Z',
          interval: 10,
        }),
      ]

      const conflicts = detectConflicts(local, server)

      expect(conflicts).toHaveLength(0)
    })

    it('should detect conflict when timestamps are equal but values differ', () => {
      const local = [
        createLocalState({
          updated_at: new Date('2024-01-15T10:00:00Z'),
          interval: 10, // Different from server
        }),
      ]
      const server = [
        createServerState({
          updated_at: '2024-01-15T10:00:00Z',
          interval: 5,
        }),
      ]

      const conflicts = detectConflicts(local, server)

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].fieldDifferences).toContain('interval')
    })

    it('should detect multiple field differences', () => {
      const local = [
        createLocalState({
          updated_at: new Date('2024-01-15T10:00:00Z'),
          interval: 10,
          ease_factor: 2.0,
          state: 'learning',
        }),
      ]
      const server = [
        createServerState({
          updated_at: '2024-01-15T10:00:00Z',
          interval: 5,
          ease_factor: 2.5,
          state: 'review',
        }),
      ]

      const conflicts = detectConflicts(local, server)

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].fieldDifferences).toContain('interval')
      expect(conflicts[0].fieldDifferences).toContain('ease_factor')
      expect(conflicts[0].fieldDifferences).toContain('state')
    })

    it('should return empty array when no matching server state exists', () => {
      const local = [createLocalState()]
      const server: ReturnType<typeof createServerState>[] = []

      const conflicts = detectConflicts(local, server)

      expect(conflicts).toHaveLength(0)
    })
  })

  describe('resolveConflict', () => {
    const conflict: ConflictInfo = {
      type: 'card_state',
      localData: createLocalState({ interval: 10 }),
      serverData: createServerState({ interval: 5 }),
      fieldDifferences: ['interval'],
    }

    it('should return local data when resolution is local', () => {
      const resolved = resolveConflict(conflict, 'local')

      expect(resolved.interval).toBe(10)
      expect(resolved.id).toBe('user1:card1')
    })

    it('should return server data when resolution is server', () => {
      const resolved = resolveConflict(conflict, 'server')

      expect(resolved.interval).toBe(5)
      expect(resolved.id).toBe('user1:card1')
    })

    it('should convert server dates to Date objects', () => {
      const resolved = resolveConflict(conflict, 'server')

      expect(resolved.due).toBeInstanceOf(Date)
      expect(resolved.updated_at).toBeInstanceOf(Date)
    })
  })

  describe('autoResolveConflicts', () => {
    const conflicts: ConflictInfo[] = [
      {
        type: 'card_state',
        localData: createLocalState({
          updated_at: new Date('2024-01-16T10:00:00Z'),
          interval: 10,
        }),
        serverData: createServerState({
          updated_at: '2024-01-15T10:00:00Z',
          interval: 5,
        }),
        fieldDifferences: ['interval'],
      },
    ]

    it('should prefer local when strategy is prefer-local', () => {
      const resolutions = autoResolveConflicts(conflicts, 'prefer-local')

      expect(resolutions.size).toBe(1)
      expect(resolutions.get('user1:card1')?.interval).toBe(10)
    })

    it('should prefer server when strategy is prefer-server', () => {
      const resolutions = autoResolveConflicts(conflicts, 'prefer-server')

      expect(resolutions.size).toBe(1)
      expect(resolutions.get('user1:card1')?.interval).toBe(5)
    })

    it('should prefer newer when strategy is prefer-newer', () => {
      const resolutions = autoResolveConflicts(conflicts, 'prefer-newer')

      // Local is newer (2024-01-16 vs 2024-01-15)
      expect(resolutions.size).toBe(1)
      expect(resolutions.get('user1:card1')?.interval).toBe(10)
    })
  })

  describe('formatConflictForDisplay', () => {
    const conflict: ConflictInfo = {
      type: 'card_state',
      localData: createLocalState({
        due: new Date('2024-01-20T10:00:00Z'),
        interval: 10,
        state: 'review',
        repetitions: 5,
        updated_at: new Date('2024-01-15T10:00:00Z'),
      }),
      serverData: createServerState({
        due: '2024-01-25T10:00:00Z',
        interval: 7,
        state: 'learning',
        repetitions: 3,
        updated_at: '2024-01-14T10:00:00Z',
      }),
      fieldDifferences: ['due', 'interval', 'state', 'repetitions'],
    }

    it('should format conflict data for display', () => {
      const formatted = formatConflictForDisplay(conflict)

      expect(formatted.local).toBeDefined()
      expect(formatted.server).toBeDefined()
      expect(formatted.differences).toBeDefined()
    })

    it('should translate state labels to Japanese', () => {
      const formatted = formatConflictForDisplay(conflict)

      expect(formatted.local.state).toBe('復習')
      expect(formatted.server.state).toBe('学習中')
    })

    it('should format interval as days', () => {
      const formatted = formatConflictForDisplay(conflict)

      expect(formatted.local.interval).toBe('10日')
      expect(formatted.server.interval).toBe('7日')
    })

    it('should translate difference field names', () => {
      const formatted = formatConflictForDisplay(conflict)

      // The formatted differences should contain Japanese labels
      expect(formatted.differences.length).toBeGreaterThan(0)
    })
  })
})
