/**
 * Dexie.js Schema for オフラインファースト IndexedDB
 * つばめSRS - Supabase テーブルのローカルミラー
 */

import Dexie, { type Table } from 'dexie'
import type {
  Profile,
  NoteType,
  CardTemplate,
  Deck,
  Note,
  Card,
  CardState,
} from '@/types/database'

// Local version of CardStateRecord (with Date instead of string)
export interface LocalCardState {
  id: string // composite key: `${user_id}:${card_id}`
  user_id: string
  card_id: string
  due: Date
  interval: number
  ease_factor: number
  repetitions: number
  state: CardState
  learning_step: number
  updated_at: Date
}

// Local version of ReviewLog
export interface LocalReviewLog {
  id: string
  user_id: string
  card_id: string
  ease: 1 | 2 | 3 | 4
  interval: number
  last_interval: number
  time_ms: number | null
  reviewed_at: Date
  synced_at: Date | null
}

// Sync queue entry for pending changes
export interface SyncQueueEntry {
  id?: number // Auto-increment
  table: 'card_states' | 'review_logs'
  operation: 'upsert' | 'delete'
  record_id: string
  payload: Record<string, unknown>
  created_at: Date
  attempts: number
  last_error?: string
}

// Sync metadata for tracking last sync times
export interface SyncMetadata {
  key: string
  value: string | number | Date
}

class TsubameSRSDatabase extends Dexie {
  // Tables
  profiles!: Table<Profile>
  noteTypes!: Table<NoteType>
  cardTemplates!: Table<CardTemplate>
  decks!: Table<Deck>
  notes!: Table<Note>
  cards!: Table<Card>
  cardStates!: Table<LocalCardState>
  reviewLogs!: Table<LocalReviewLog>
  syncQueue!: Table<SyncQueueEntry>
  syncMetadata!: Table<SyncMetadata>

  constructor() {
    super('tsubame-srs')

    // Version 1: Initial schema
    this.version(1).stores({
      // Read-only tables (synced from server)
      profiles: 'id',
      noteTypes: 'id',
      cardTemplates: 'id, note_type_id',
      decks: 'id, owner_id',
      notes: 'id, deck_id',
      cards: 'id, note_id, deck_id',

      // Read-write tables (synced bidirectionally)
      cardStates: 'id, user_id, card_id, due, [user_id+card_id]',
      reviewLogs: 'id, user_id, card_id, synced_at',

      // Sync management
      syncQueue: '++id, table, created_at',
      syncMetadata: 'key',
    })

    // Version 2: Add attempts index to syncQueue for querying pending entries
    this.version(2).stores({
      profiles: 'id',
      noteTypes: 'id',
      cardTemplates: 'id, note_type_id',
      decks: 'id, owner_id',
      notes: 'id, deck_id',
      cards: 'id, note_id, deck_id',
      cardStates: 'id, user_id, card_id, due, [user_id+card_id]',
      reviewLogs: 'id, user_id, card_id, synced_at',
      syncQueue: '++id, table, created_at, attempts',
      syncMetadata: 'key',
    })
  }
}

// Database instance (singleton)
export const db = new TsubameSRSDatabase()

// Helper functions

/**
 * Create composite key for card_states
 */
export function createCardStateId(userId: string, cardId: string): string {
  return `${userId}:${cardId}`
}

/**
 * Generate UUID for new records
 */
export function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Get card state by user and card ID
 */
export async function getCardState(
  userId: string,
  cardId: string
): Promise<LocalCardState | undefined> {
  const id = createCardStateId(userId, cardId)
  return db.cardStates.get(id)
}

/**
 * Save card state (upsert)
 */
export async function saveCardState(
  state: Omit<LocalCardState, 'id'>
): Promise<void> {
  const id = createCardStateId(state.user_id, state.card_id)
  await db.cardStates.put({
    ...state,
    id,
    updated_at: new Date(),
  })
}

/**
 * Get all due cards for a user in a deck
 */
export async function getDueCards(
  userId: string,
  deckId: string,
  now: Date = new Date()
): Promise<LocalCardState[]> {
  // Get all cards in the deck
  const deckCards = await db.cards.where('deck_id').equals(deckId).toArray()
  const cardIds = deckCards.map((c) => c.id)

  // Get card states for those cards that are due
  const states = await db.cardStates
    .where('user_id')
    .equals(userId)
    .filter((s) => cardIds.includes(s.card_id) && s.due <= now)
    .toArray()

  return states
}

/**
 * Save review log
 */
export async function saveReviewLog(
  log: Omit<LocalReviewLog, 'synced_at'>
): Promise<void> {
  await db.reviewLogs.put({
    ...log,
    synced_at: null,
  })
}

/**
 * Get unsynced review logs
 */
export async function getUnsyncedReviewLogs(): Promise<LocalReviewLog[]> {
  return db.reviewLogs.where('synced_at').equals(null as unknown as Date).toArray()
}

/**
 * Mark review logs as synced
 */
export async function markReviewLogsSynced(ids: string[]): Promise<void> {
  await db.reviewLogs
    .where('id')
    .anyOf(ids)
    .modify({ synced_at: new Date() })
}

/**
 * Clear all local data (for logout)
 */
export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.profiles,
      db.noteTypes,
      db.cardTemplates,
      db.decks,
      db.notes,
      db.cards,
      db.cardStates,
      db.reviewLogs,
      db.syncQueue,
      db.syncMetadata,
    ],
    async () => {
      await Promise.all([
        db.profiles.clear(),
        db.noteTypes.clear(),
        db.cardTemplates.clear(),
        db.decks.clear(),
        db.notes.clear(),
        db.cards.clear(),
        db.cardStates.clear(),
        db.reviewLogs.clear(),
        db.syncQueue.clear(),
        db.syncMetadata.clear(),
      ])
    }
  )
}

/**
 * Get sync metadata value
 */
export async function getSyncMeta(key: string): Promise<string | number | Date | undefined> {
  const entry = await db.syncMetadata.get(key)
  return entry?.value
}

/**
 * Set sync metadata value
 */
export async function setSyncMeta(key: string, value: string | number | Date): Promise<void> {
  await db.syncMetadata.put({ key, value })
}

/**
 * Delete old synced review logs (older than 30 days)
 */
export async function cleanupOldReviewLogs(): Promise<number> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const oldLogs = await db.reviewLogs
    .filter((log) => log.synced_at !== null && log.synced_at < thirtyDaysAgo)
    .toArray()

  const ids = oldLogs.map((log) => log.id)
  await db.reviewLogs.bulkDelete(ids)

  return ids.length
}
