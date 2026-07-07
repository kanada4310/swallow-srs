/**
 * Tests for sync queue retry/quarantine policy.
 *
 * 送信キューの「隔離（要確認）」判定と集計の純ロジックを検証する。
 * 以前は失敗5回で再送も保留カウントも止まり、学習記録が静かに消失していた。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// db をモック（retryFailedSync 等のふるまい検証用）
const modifyMock = vi.fn().mockResolvedValue(0)
const failedEntries: Array<{ id: number; attempts: number }> = []

vi.mock('./schema', () => ({
  db: {
    syncQueue: {
      where: vi.fn(() => ({
        aboveOrEqual: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue(failedEntries),
        })),
        below: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(0),
        })),
        anyOf: vi.fn(() => ({
          modify: modifyMock,
        })),
      })),
    },
  },
}))

import {
  QUARANTINE_ATTEMPTS,
  isQuarantined,
  summarizeQueue,
  retryFailedSync,
} from './sync-queue'

describe('sync-queue: 隔離判定・集計', () => {
  describe('isQuarantined', () => {
    it('しきい値未満は隔離しない', () => {
      expect(isQuarantined({ attempts: 0 })).toBe(false)
      expect(isQuarantined({ attempts: QUARANTINE_ATTEMPTS - 1 })).toBe(false)
    })

    it('しきい値ちょうど・超過は隔離する', () => {
      expect(isQuarantined({ attempts: QUARANTINE_ATTEMPTS })).toBe(true)
      expect(isQuarantined({ attempts: QUARANTINE_ATTEMPTS + 5 })).toBe(true)
    })

    it('しきい値は 5 より大きい（以前は5で埋もれていた回帰防止）', () => {
      // 失敗5回でも再送継続中＝保留として数える（隔離しない）
      expect(isQuarantined({ attempts: 5 })).toBe(false)
      expect(QUARANTINE_ATTEMPTS).toBeGreaterThan(5)
    })
  })

  describe('summarizeQueue', () => {
    it('空キューは全て0', () => {
      expect(summarizeQueue([])).toEqual({ pending: 0, quarantined: 0 })
    })

    it('再送継続中と隔離を正しく分ける', () => {
      const entries = [
        { attempts: 0 },
        { attempts: 3 },
        { attempts: QUARANTINE_ATTEMPTS - 1 }, // まだ保留
        { attempts: QUARANTINE_ATTEMPTS }, // 隔離
        { attempts: QUARANTINE_ATTEMPTS + 2 }, // 隔離
      ]
      expect(summarizeQueue(entries)).toEqual({ pending: 3, quarantined: 2 })
    })

    it('全て隔離', () => {
      const entries = [
        { attempts: QUARANTINE_ATTEMPTS },
        { attempts: QUARANTINE_ATTEMPTS + 1 },
      ]
      expect(summarizeQueue(entries)).toEqual({ pending: 0, quarantined: 2 })
    })
  })
})

describe('sync-queue: retryFailedSync', () => {
  beforeEach(() => {
    modifyMock.mockClear()
    failedEntries.length = 0
  })

  it('隔離エントリを再送対象に戻す（attempts を0にリセット）', async () => {
    failedEntries.push({ id: 1, attempts: QUARANTINE_ATTEMPTS })
    failedEntries.push({ id: 2, attempts: QUARANTINE_ATTEMPTS + 3 })

    const count = await retryFailedSync()

    expect(count).toBe(2)
    expect(modifyMock).toHaveBeenCalledWith({ attempts: 0, last_error: undefined })
  })

  it('隔離が無ければ何もしない', async () => {
    const count = await retryFailedSync()
    expect(count).toBe(0)
  })
})
