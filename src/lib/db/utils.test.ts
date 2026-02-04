/**
 * Tests for utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isOnline,
  retryWithBackoff,
  sleep,
  debounce,
  parseServerDate,
  formatForServer,
  isNewerThan,
  mergeWithNewer,
} from './utils'

describe('Online detection', () => {
  const originalNavigator = global.navigator

  beforeEach(() => {
    // Reset navigator mock
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    })
  })

  describe('isOnline', () => {
    it('should return true when navigator.onLine is true', () => {
      Object.defineProperty(global, 'navigator', {
        value: { onLine: true },
        writable: true,
        configurable: true,
      })

      expect(isOnline()).toBe(true)
    })

    it('should return false when navigator.onLine is false', () => {
      Object.defineProperty(global, 'navigator', {
        value: { onLine: false },
        writable: true,
        configurable: true,
      })

      expect(isOnline()).toBe(false)
    })

    it('should return true when navigator is undefined (SSR)', () => {
      Object.defineProperty(global, 'navigator', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      expect(isOnline()).toBe(true)
    })
  })
})

describe('Date utilities', () => {
  describe('parseServerDate', () => {
    it('should parse ISO date string to Date object', () => {
      const dateStr = '2024-01-15T10:30:00.000Z'
      const date = parseServerDate(dateStr)

      expect(date).toBeInstanceOf(Date)
      expect(date.toISOString()).toBe(dateStr)
    })
  })

  describe('formatForServer', () => {
    it('should format Date object to ISO string', () => {
      const date = new Date('2024-01-15T10:30:00.000Z')
      const formatted = formatForServer(date)

      expect(formatted).toBe('2024-01-15T10:30:00.000Z')
    })
  })

  describe('isNewerThan', () => {
    it('should return true when first date is newer', () => {
      const date1 = new Date('2024-01-16T10:00:00Z')
      const date2 = new Date('2024-01-15T10:00:00Z')

      expect(isNewerThan(date1, date2)).toBe(true)
    })

    it('should return false when first date is older', () => {
      const date1 = new Date('2024-01-14T10:00:00Z')
      const date2 = new Date('2024-01-15T10:00:00Z')

      expect(isNewerThan(date1, date2)).toBe(false)
    })

    it('should return false when dates are equal', () => {
      const date1 = new Date('2024-01-15T10:00:00Z')
      const date2 = new Date('2024-01-15T10:00:00Z')

      expect(isNewerThan(date1, date2)).toBe(false)
    })
  })

  describe('mergeWithNewer', () => {
    interface TestObject {
      value: number
      updated_at: Date
    }

    it('should return local when local is newer', () => {
      const local: TestObject = {
        value: 10,
        updated_at: new Date('2024-01-16T10:00:00Z'),
      }
      const server: TestObject = {
        value: 5,
        updated_at: new Date('2024-01-15T10:00:00Z'),
      }

      const result = mergeWithNewer(local, server)

      expect(result.merged.value).toBe(10)
      expect(result.hasConflict).toBe(false)
    })

    it('should return server when server is newer', () => {
      const local: TestObject = {
        value: 10,
        updated_at: new Date('2024-01-14T10:00:00Z'),
      }
      const server: TestObject = {
        value: 5,
        updated_at: new Date('2024-01-15T10:00:00Z'),
      }

      const result = mergeWithNewer(local, server)

      expect(result.merged.value).toBe(5)
      expect(result.hasConflict).toBe(false)
    })

    it('should detect conflict when timestamps are equal but values differ', () => {
      const local: TestObject = {
        value: 10,
        updated_at: new Date('2024-01-15T10:00:00Z'),
      }
      const server: TestObject = {
        value: 5,
        updated_at: new Date('2024-01-15T10:00:00Z'),
      }

      const result = mergeWithNewer(local, server)

      expect(result.hasConflict).toBe(true)
    })

    it('should not detect conflict when timestamps and values are equal', () => {
      const local: TestObject = {
        value: 10,
        updated_at: new Date('2024-01-15T10:00:00Z'),
      }
      const server: TestObject = {
        value: 10,
        updated_at: new Date('2024-01-15T10:00:00Z'),
      }

      const result = mergeWithNewer(local, server)

      expect(result.hasConflict).toBe(false)
    })
  })
})

describe('Async utilities', () => {
  describe('sleep', () => {
    it('should resolve after specified time', async () => {
      vi.useFakeTimers()

      const promise = sleep(100)
      vi.advanceTimersByTime(100)

      await expect(promise).resolves.toBeUndefined()

      vi.useRealTimers()
    })
  })

  describe('retryWithBackoff', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const promise = retryWithBackoff(fn)
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success')

      const promise = retryWithBackoff(fn, { maxRetries: 3, initialDelay: 100 })

      // Advance through the first retry delay
      await vi.advanceTimersByTimeAsync(100)

      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should throw after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fail'))

      const promise = retryWithBackoff(fn, { maxRetries: 2, initialDelay: 100 })

      // Attach rejection handler immediately to prevent unhandled rejection
      const resultPromise = promise.catch((e: Error) => e)

      // Advance through all retry delays
      await vi.runAllTimersAsync()

      const error = await resultPromise
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('always fail')
      expect(fn).toHaveBeenCalledTimes(3) // Initial + 2 retries
    })

    it('should call onRetry callback', async () => {
      const onRetry = vi.fn()
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success')

      const promise = retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelay: 100,
        onRetry,
      })

      await vi.advanceTimersByTimeAsync(100)
      await promise

      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error))
    })
  })

  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should debounce function calls', () => {
      const fn = vi.fn()
      const debounced = debounce(fn, 100)

      debounced()
      debounced()
      debounced()

      expect(fn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(100)

      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should pass arguments to debounced function', () => {
      const fn = vi.fn()
      const debounced = debounce(fn, 100)

      debounced('arg1', 'arg2')

      vi.advanceTimersByTime(100)

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2')
    })

    it('should reset timer on subsequent calls', () => {
      const fn = vi.fn()
      const debounced = debounce(fn, 100)

      debounced()
      vi.advanceTimersByTime(50)
      debounced()
      vi.advanceTimersByTime(50)
      debounced()
      vi.advanceTimersByTime(100)

      expect(fn).toHaveBeenCalledTimes(1)
    })
  })
})
