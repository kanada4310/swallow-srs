/**
 * Sync Queue - オフライン時の変更を保持しオンライン時に処理
 */

import { db, type SyncQueueEntry } from './schema'

/**
 * 累積失敗回数がこの値に達したエントリは「隔離（要確認）」扱いにする。
 *
 * 以前は失敗5回で自動リトライ対象からも保留カウントからも外れ、記録が静かに
 * 埋もれていた（=「同期済み」に見えるのに未送信）。この値まではオンラインの
 * 同期サイクルごとに再送を続け（アップサートで冪等なので二重送信は無害）、
 * それを超えて初めて「壊れている可能性が高い1件」として隔離・可視化する。
 * 同期は5分間隔なので 20 回 ≒ 100 分の連続失敗が隔離条件。
 */
export const QUARANTINE_ATTEMPTS = 20
const BATCH_SIZE = 50

/**
 * 累積失敗が隔離しきい値に達しているか（純関数・テスト対象）
 */
export function isQuarantined(entry: Pick<SyncQueueEntry, 'attempts'>): boolean {
  return entry.attempts >= QUARANTINE_ATTEMPTS
}

/**
 * 送信待ちキューを「再送継続中」と「隔離（要確認）」に集計する（純関数）
 */
export function summarizeQueue(entries: Array<Pick<SyncQueueEntry, 'attempts'>>): {
  pending: number
  quarantined: number
} {
  let pending = 0
  let quarantined = 0
  for (const entry of entries) {
    if (isQuarantined(entry)) quarantined++
    else pending++
  }
  return { pending, quarantined }
}

/**
 * Add an entry to the sync queue
 */
export async function addToSyncQueue(
  table: SyncQueueEntry['table'],
  operation: SyncQueueEntry['operation'],
  recordId: string,
  payload: Record<string, unknown>
): Promise<number> {
  const entry: Omit<SyncQueueEntry, 'id'> = {
    table,
    operation,
    record_id: recordId,
    payload,
    created_at: new Date(),
    attempts: 0,
  }

  return db.syncQueue.add(entry)
}

/**
 * Get pending sync entries
 */
export async function getPendingEntries(
  limit: number = BATCH_SIZE
): Promise<SyncQueueEntry[]> {
  return db.syncQueue
    .where('attempts')
    .below(QUARANTINE_ATTEMPTS)
    .limit(limit)
    .sortBy('created_at')
}

/**
 * Get count of pending sync entries (再送継続中＝隔離前のもの)
 */
export async function getPendingSyncCount(): Promise<number> {
  return db.syncQueue.where('attempts').below(QUARANTINE_ATTEMPTS).count()
}

/**
 * 隔離（要確認）エントリ数 = 連続失敗が続き送信できていない記録の件数
 */
export async function getQuarantinedCount(): Promise<number> {
  return db.syncQueue.where('attempts').aboveOrEqual(QUARANTINE_ATTEMPTS).count()
}

/**
 * キュー全体を「再送継続中」と「隔離」に集計して返す
 */
export async function getSyncQueueSummary(): Promise<{
  pending: number
  quarantined: number
}> {
  const entries = await db.syncQueue.toArray()
  return summarizeQueue(entries)
}

/**
 * Mark entry as processed (delete from queue)
 */
export async function markAsProcessed(id: number): Promise<void> {
  await db.syncQueue.delete(id)
}

/**
 * Mark entry as failed (increment attempts and store error)
 */
export async function markAsFailed(id: number, error: string): Promise<void> {
  const entry = await db.syncQueue.get(id)
  const newAttempts = (entry?.attempts ?? 0) + 1
  await db.syncQueue.update(id, {
    attempts: newAttempts,
    last_error: error,
  })
}

/**
 * Process the sync queue by executing pending operations
 */
export async function processSyncQueue(
  syncFn: (entries: SyncQueueEntry[]) => Promise<{
    success: number[]
    failed: Array<{ id: number; error: string }>
  }>
): Promise<{ processed: number; failed: number }> {
  const entries = await getPendingEntries()

  if (entries.length === 0) {
    return { processed: 0, failed: 0 }
  }

  const result = await syncFn(entries)

  // Remove successfully processed entries
  await db.syncQueue.bulkDelete(result.success)

  // Update failed entries
  for (const failure of result.failed) {
    const entry = await db.syncQueue.get(failure.id)
    if (entry) {
      await db.syncQueue.update(failure.id, {
        attempts: entry.attempts + 1,
        last_error: failure.error,
      })
    }
  }

  return {
    processed: result.success.length,
    failed: result.failed.length,
  }
}

/**
 * Clear all entries from the sync queue
 */
export async function clearSyncQueue(): Promise<void> {
  await db.syncQueue.clear()
}

/**
 * 隔離（要確認）状態のエントリ一覧
 */
export async function getFailedEntries(): Promise<SyncQueueEntry[]> {
  return db.syncQueue
    .where('attempts')
    .aboveOrEqual(QUARANTINE_ATTEMPTS)
    .toArray()
}

/**
 * 隔離エントリを再送対象に戻す（失敗回数を0にリセット）
 */
export async function retryFailedSync(): Promise<number> {
  const failed = await getFailedEntries()
  const ids = failed.map((e) => e.id).filter((id): id is number => id !== undefined)

  await db.syncQueue
    .where('id')
    .anyOf(ids)
    .modify({ attempts: 0, last_error: undefined })

  return ids.length
}

/**
 * Queue a card state update
 */
export async function queueCardStateUpdate(
  userId: string,
  cardId: string,
  state: {
    due: Date
    interval: number
    ease_factor: number
    repetitions: number
    state: string
    learning_step: number
  }
): Promise<number> {
  return addToSyncQueue('card_states', 'upsert', `${userId}:${cardId}`, {
    user_id: userId,
    card_id: cardId,
    due: state.due.toISOString(),
    interval: state.interval,
    ease_factor: state.ease_factor,
    repetitions: state.repetitions,
    state: state.state,
    learning_step: state.learning_step,
    updated_at: new Date().toISOString(),
  })
}

/**
 * Queue a review log
 */
export async function queueReviewLog(
  reviewLog: {
    id: string
    user_id: string
    card_id: string
    ease: 1 | 2 | 3 | 4
    interval: number
    last_interval: number
    time_ms: number | null
    reviewed_at: Date
  }
): Promise<number> {
  return addToSyncQueue('review_logs', 'upsert', reviewLog.id, {
    ...reviewLog,
    reviewed_at: reviewLog.reviewed_at.toISOString(),
  })
}

/**
 * Group queue entries by table for batch processing
 */
export function groupEntriesByTable(
  entries: SyncQueueEntry[]
): Map<SyncQueueEntry['table'], SyncQueueEntry[]> {
  const grouped = new Map<SyncQueueEntry['table'], SyncQueueEntry[]>()

  for (const entry of entries) {
    const existing = grouped.get(entry.table) ?? []
    existing.push(entry)
    grouped.set(entry.table, existing)
  }

  return grouped
}
