/**
 * Sync Queue - オフライン時の変更を保持しオンライン時に処理
 */

import { db, type SyncQueueEntry } from './schema'

const MAX_RETRY_ATTEMPTS = 5
const BATCH_SIZE = 50

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
    .below(MAX_RETRY_ATTEMPTS)
    .limit(limit)
    .sortBy('created_at')
}

/**
 * Get count of pending sync entries
 */
export async function getPendingSyncCount(): Promise<number> {
  return db.syncQueue.where('attempts').below(MAX_RETRY_ATTEMPTS).count()
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
 * Get entries that have exceeded max retry attempts
 */
export async function getFailedEntries(): Promise<SyncQueueEntry[]> {
  return db.syncQueue
    .where('attempts')
    .aboveOrEqual(MAX_RETRY_ATTEMPTS)
    .toArray()
}

/**
 * Reset failed entries to retry
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
