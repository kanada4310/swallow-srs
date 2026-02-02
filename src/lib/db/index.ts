/**
 * オフラインDB エクスポート
 */

export {
  db,
  createCardStateId,
  generateId,
  getCardState,
  saveCardState,
  getDueCards,
  saveReviewLog,
  getUnsyncedReviewLogs,
  markReviewLogsSynced,
  clearAllData,
  getSyncMeta,
  setSyncMeta,
  cleanupOldReviewLogs,
} from './schema'

export type {
  LocalCardState,
  LocalReviewLog,
  SyncQueueEntry,
  SyncMetadata,
} from './schema'

export {
  addToSyncQueue,
  processSyncQueue,
  getPendingSyncCount,
  clearSyncQueue,
  retryFailedSync,
} from './sync-queue'

export {
  syncWithServer,
  pullFromServer,
  pushToServer,
  fullSync,
  getSyncStatus,
  type SyncStatus,
} from './sync'

export {
  detectConflicts,
  resolveConflict,
  type ConflictInfo,
  type ConflictResolution,
} from './conflict'

export {
  useOnlineStatus,
  useSyncStatus,
  useLocalDb,
  useOfflineCards,
} from './hooks'

export { isOnline, waitForOnline, registerOnlineListener } from './utils'
