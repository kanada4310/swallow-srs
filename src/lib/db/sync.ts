/**
 * 同期オーケストレーション - ローカルDBとSupabaseの同期
 */

import {
  db,
  getSyncMeta,
  setSyncMeta,
  markReviewLogsSynced,
  type LocalCardState,
  type LocalReviewLog,
} from './schema'
import {
  processSyncQueue,
  getPendingSyncCount,
  groupEntriesByTable,
} from './sync-queue'
import { detectConflicts, type ConflictInfo } from './conflict'
import { isOnline, formatForServer, parseServerDate } from './utils'

export interface SyncStatus {
  isOnline: boolean
  isSyncing: boolean
  pendingCount: number
  lastSyncAt: Date | null
  conflicts: ConflictInfo[]
  error: string | null
}

let syncStatus: SyncStatus = {
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  lastSyncAt: null,
  conflicts: [],
  error: null,
}

type SyncStatusListener = (status: SyncStatus) => void
const statusListeners: Set<SyncStatusListener> = new Set()

/**
 * Get current sync status
 */
export function getSyncStatus(): SyncStatus {
  return { ...syncStatus }
}

/**
 * Subscribe to sync status changes
 */
export function subscribeSyncStatus(listener: SyncStatusListener): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

function updateStatus(updates: Partial<SyncStatus>) {
  syncStatus = { ...syncStatus, ...updates }
  statusListeners.forEach((listener) => listener(syncStatus))
}

/**
 * Full sync - pull then push
 */
export async function fullSync(userId: string): Promise<void> {
  if (!isOnline()) {
    updateStatus({ isOnline: false })
    return
  }

  updateStatus({ isSyncing: true, error: null })

  try {
    // Pull first to get latest server state
    await pullFromServer(userId)

    // Then push local changes
    await pushToServer()

    // Update last sync time
    const now = new Date()
    await setSyncMeta('lastSyncAt', now.toISOString())
    updateStatus({
      isSyncing: false,
      lastSyncAt: now,
      pendingCount: await getPendingSyncCount(),
    })
  } catch (error) {
    updateStatus({
      isSyncing: false,
      error: error instanceof Error ? error.message : 'Sync failed',
    })
    throw error
  }
}

/**
 * Sync with server (alias for fullSync)
 */
export async function syncWithServer(userId: string): Promise<void> {
  return fullSync(userId)
}

/**
 * Pull data from server to local
 */
export async function pullFromServer(userId: string): Promise<void> {
  const lastSync = await getSyncMeta('lastPullAt')
  const lastSyncDate = lastSync ? new Date(lastSync as string) : null

  const response = await fetch('/api/sync/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      lastSyncAt: lastSyncDate?.toISOString(),
    }),
  })

  if (!response.ok) {
    throw new Error(`Pull failed: ${response.statusText}`)
  }

  const data = await response.json()

  // Check for conflicts with card_states
  if (data.cardStates && data.cardStates.length > 0) {
    const localStates = await db.cardStates
      .where('user_id')
      .equals(userId)
      .toArray()

    const conflicts = detectConflicts(localStates, data.cardStates)

    if (conflicts.length > 0) {
      updateStatus({ conflicts })
      // Don't apply conflicting updates - wait for resolution
      // Only apply non-conflicting updates
      const conflictIds = new Set(
        conflicts.map((c) => `${c.localData.user_id}:${c.localData.card_id}`)
      )

      const safeUpdates = data.cardStates.filter(
        (s: { user_id: string; card_id: string }) =>
          !conflictIds.has(`${s.user_id}:${s.card_id}`)
      )

      await applyServerCardStates(safeUpdates)
    } else {
      await applyServerCardStates(data.cardStates)
    }
  }

  // Apply other data (read-only tables)
  if (data.profiles) {
    await db.profiles.bulkPut(data.profiles)
  }

  if (data.decks) {
    await db.decks.bulkPut(data.decks)
  }

  if (data.notes) {
    await db.notes.bulkPut(data.notes)
  }

  if (data.cards) {
    await db.cards.bulkPut(data.cards)
  }

  if (data.noteTypes) {
    await db.noteTypes.bulkPut(data.noteTypes)
  }

  if (data.cardTemplates) {
    await db.cardTemplates.bulkPut(data.cardTemplates)
  }

  await setSyncMeta('lastPullAt', new Date().toISOString())
}

/**
 * Apply server card states to local DB
 */
async function applyServerCardStates(
  serverStates: Array<{
    user_id: string
    card_id: string
    due: string
    interval: number
    ease_factor: number
    repetitions: number
    state: string
    learning_step: number
    lapses?: number
    updated_at: string
  }>
): Promise<void> {
  const localStates: LocalCardState[] = serverStates.map((s) => ({
    id: `${s.user_id}:${s.card_id}`,
    user_id: s.user_id,
    card_id: s.card_id,
    due: parseServerDate(s.due),
    interval: s.interval,
    ease_factor: s.ease_factor,
    repetitions: s.repetitions,
    state: s.state as LocalCardState['state'],
    learning_step: s.learning_step,
    lapses: s.lapses ?? 0,
    updated_at: parseServerDate(s.updated_at),
  }))

  await db.cardStates.bulkPut(localStates)
}

/**
 * Push local changes to server
 */
export async function pushToServer(): Promise<void> {
  const pendingCount = await getPendingSyncCount()
  updateStatus({ pendingCount })

  if (pendingCount === 0) {
    return
  }

  await processSyncQueue(async (entries) => {
    const grouped = groupEntriesByTable(entries)
    const success: number[] = []
    const failed: Array<{ id: number; error: string }> = []

    // Process card_states
    const cardStateEntries = grouped.get('card_states') ?? []
    if (cardStateEntries.length > 0) {
      try {
        const response = await fetch('/api/sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cardStates: cardStateEntries.map((e) => e.payload),
          }),
        })

        if (response.ok) {
          success.push(
            ...cardStateEntries
              .map((e) => e.id)
              .filter((id): id is number => id !== undefined)
          )
        } else {
          const error = await response.text()
          failed.push(
            ...cardStateEntries
              .filter((e) => e.id !== undefined)
              .map((e) => ({ id: e.id as number, error }))
          )
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        failed.push(
          ...cardStateEntries
            .filter((e) => e.id !== undefined)
            .map((e) => ({ id: e.id as number, error: errorMsg }))
        )
      }
    }

    // Process review_logs
    const reviewLogEntries = grouped.get('review_logs') ?? []
    if (reviewLogEntries.length > 0) {
      try {
        const response = await fetch('/api/sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reviewLogs: reviewLogEntries.map((e) => e.payload),
          }),
        })

        if (response.ok) {
          success.push(
            ...reviewLogEntries
              .map((e) => e.id)
              .filter((id): id is number => id !== undefined)
          )

          // Mark review logs as synced in local DB
          const logIds = reviewLogEntries.map((e) => e.record_id)
          await markReviewLogsSynced(logIds)
        } else {
          const error = await response.text()
          failed.push(
            ...reviewLogEntries
              .filter((e) => e.id !== undefined)
              .map((e) => ({ id: e.id as number, error }))
          )
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        failed.push(
          ...reviewLogEntries
            .filter((e) => e.id !== undefined)
            .map((e) => ({ id: e.id as number, error: errorMsg }))
        )
      }
    }

    return { success, failed }
  })

  updateStatus({ pendingCount: await getPendingSyncCount() })
}

/**
 * Save answer locally and queue for sync
 */
export async function saveAnswerLocally(
  userId: string,
  cardId: string,
  ease: 1 | 2 | 3 | 4,
  newSchedule: {
    due: Date
    interval: number
    easeFactor: number
    repetitions: number
    state: string
    learningStep: number
    lapses?: number
  },
  lastInterval: number,
  timeMs: number | null
): Promise<void> {
  const now = new Date()
  const reviewLogId = crypto.randomUUID()

  // Save to local DB
  await db.transaction('rw', [db.cardStates, db.reviewLogs, db.syncQueue], async () => {
    // Update card state
    const cardState: LocalCardState = {
      id: `${userId}:${cardId}`,
      user_id: userId,
      card_id: cardId,
      due: newSchedule.due,
      interval: newSchedule.interval,
      ease_factor: newSchedule.easeFactor,
      repetitions: newSchedule.repetitions,
      state: newSchedule.state as LocalCardState['state'],
      learning_step: newSchedule.learningStep,
      lapses: newSchedule.lapses ?? 0,
      updated_at: now,
    }
    await db.cardStates.put(cardState)

    // Add review log
    const reviewLog: LocalReviewLog = {
      id: reviewLogId,
      user_id: userId,
      card_id: cardId,
      ease,
      interval: newSchedule.interval,
      last_interval: lastInterval,
      time_ms: timeMs,
      reviewed_at: now,
      synced_at: null,
    }
    await db.reviewLogs.add(reviewLog)

    // Add to sync queue
    await db.syncQueue.add({
      table: 'card_states',
      operation: 'upsert',
      record_id: `${userId}:${cardId}`,
      payload: {
        user_id: userId,
        card_id: cardId,
        due: formatForServer(newSchedule.due),
        interval: newSchedule.interval,
        ease_factor: newSchedule.easeFactor,
        repetitions: newSchedule.repetitions,
        state: newSchedule.state,
        learning_step: newSchedule.learningStep,
        lapses: newSchedule.lapses ?? 0,
        updated_at: formatForServer(now),
      },
      created_at: now,
      attempts: 0,
    })

    await db.syncQueue.add({
      table: 'review_logs',
      operation: 'upsert',
      record_id: reviewLogId,
      payload: {
        id: reviewLogId,
        user_id: userId,
        card_id: cardId,
        ease,
        interval: newSchedule.interval,
        last_interval: lastInterval,
        time_ms: timeMs,
        reviewed_at: formatForServer(now),
      },
      created_at: now,
      attempts: 0,
    })
  })

  updateStatus({ pendingCount: await getPendingSyncCount() })
}

/**
 * Resolve conflict and apply resolution
 */
export async function applyConflictResolution(
  conflict: ConflictInfo,
  resolution: 'local' | 'server'
): Promise<void> {
  const id = `${conflict.localData.user_id}:${conflict.localData.card_id}`

  if (resolution === 'local') {
    // Keep local, push to server
    await db.syncQueue.add({
      table: 'card_states',
      operation: 'upsert',
      record_id: id,
      payload: {
        user_id: conflict.localData.user_id,
        card_id: conflict.localData.card_id,
        due: formatForServer(conflict.localData.due),
        interval: conflict.localData.interval,
        ease_factor: conflict.localData.ease_factor,
        repetitions: conflict.localData.repetitions,
        state: conflict.localData.state,
        learning_step: conflict.localData.learning_step,
        updated_at: formatForServer(new Date()),
      },
      created_at: new Date(),
      attempts: 0,
    })
  } else {
    // Apply server data locally
    await db.cardStates.put({
      id,
      user_id: conflict.serverData.user_id,
      card_id: conflict.serverData.card_id,
      due: parseServerDate(conflict.serverData.due),
      interval: conflict.serverData.interval,
      ease_factor: conflict.serverData.ease_factor,
      repetitions: conflict.serverData.repetitions,
      state: conflict.serverData.state as LocalCardState['state'],
      learning_step: conflict.serverData.learning_step,
      lapses: conflict.serverData.lapses ?? 0,
      updated_at: parseServerDate(conflict.serverData.updated_at),
    })
  }

  // Remove this conflict from the list
  const remainingConflicts = syncStatus.conflicts.filter(
    (c) =>
      c.localData.user_id !== conflict.localData.user_id ||
      c.localData.card_id !== conflict.localData.card_id
  )
  updateStatus({ conflicts: remainingConflicts })
}

/**
 * Initialize sync status on app start
 */
export async function initSync(): Promise<void> {
  const pendingCount = await getPendingSyncCount()
  const lastSyncStr = await getSyncMeta('lastSyncAt')
  const lastSyncAt = lastSyncStr ? new Date(lastSyncStr as string) : null

  updateStatus({
    isOnline: isOnline(),
    pendingCount,
    lastSyncAt,
  })
}
