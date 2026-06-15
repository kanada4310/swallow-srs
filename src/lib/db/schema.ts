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
  DeckSettings,
  Note,
  Card,
  CardState,
  FieldDefinition,
  GeneratedContent,
  Class,
  ClassMember,
  DeckAssignment,
  CreatureImprint,
} from '@/types/database'
import type { CardSchedule } from '@/lib/srs/scheduler'
import { resolveDeckSettings } from '@/lib/srs/scheduler'
import { orderStudyCards } from '@/lib/srs/card-ordering'

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
  lapses: number
  // FSRS fields (nullable for SM-2 cards)
  stability: number | null
  difficulty: number | null
  elapsed_days: number
  scheduled_days: number
  last_review: Date | null
  updated_at: Date
}

// Local version of ReviewLog
export interface LocalReviewLog {
  id: string
  user_id: string
  card_id: string
  deck_id?: string
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

// Audio cache entry for TTS
export interface AudioCacheEntry {
  id: string // composite key: `${noteId}:${fieldName}`
  noteId: string
  fieldName: string
  audioBlob: Blob
  audioUrl: string
  cachedAt: Date
}

// User-specific deck settings override
export interface LocalUserDeckSettings {
  id: string // composite key: `${user_id}:${deck_id}`
  user_id: string
  deck_id: string
  settings: Record<string, unknown>
  updated_at: Date
}

// 記憶のいきもの育成（Phase 10.4）— 品種インプリント（生徒×ノート）
export interface LocalUserCreatureState {
  id: string // composite key: `${user_id}:${note_id}`
  user_id: string
  note_id: string
  imprint: CreatureImprint
  nickname: string | null
  updated_at: Date
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
  audioCache!: Table<AudioCacheEntry>
  userDeckSettings!: Table<LocalUserDeckSettings>
  userCreatureState!: Table<LocalUserCreatureState>
  classes!: Table<Class>
  classMembers!: Table<ClassMember>
  deckAssignments!: Table<DeckAssignment>

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

    // Version 3: Add audio cache for TTS
    this.version(3).stores({
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
      audioCache: 'id, noteId, cachedAt',
    })

    // Version 4: Add parent_deck_id index on decks, *tags MultiEntry index on notes
    this.version(4).stores({
      profiles: 'id',
      noteTypes: 'id',
      cardTemplates: 'id, note_type_id',
      decks: 'id, owner_id, parent_deck_id',
      notes: 'id, deck_id, *tags',
      cards: 'id, note_id, deck_id',
      cardStates: 'id, user_id, card_id, due, [user_id+card_id]',
      reviewLogs: 'id, user_id, card_id, synced_at',
      syncQueue: '++id, table, created_at, attempts',
      syncMetadata: 'key',
      audioCache: 'id, noteId, cachedAt',
    })

    // Version 5: Add lapses to cardStates (no index change needed)
    this.version(5).stores({
      profiles: 'id',
      noteTypes: 'id',
      cardTemplates: 'id, note_type_id',
      decks: 'id, owner_id, parent_deck_id',
      notes: 'id, deck_id, *tags',
      cards: 'id, note_id, deck_id',
      cardStates: 'id, user_id, card_id, due, [user_id+card_id]',
      reviewLogs: 'id, user_id, card_id, synced_at',
      syncQueue: '++id, table, created_at, attempts',
      syncMetadata: 'key',
      audioCache: 'id, noteId, cachedAt',
    }).upgrade(tx => {
      // Set lapses = 0 for existing card states
      return tx.table('cardStates').toCollection().modify(cs => {
        if (cs.lapses === undefined) {
          cs.lapses = 0
        }
      })
    })

    // Version 6: Add userDeckSettings table for per-user deck setting overrides
    this.version(6).stores({
      profiles: 'id',
      noteTypes: 'id',
      cardTemplates: 'id, note_type_id',
      decks: 'id, owner_id, parent_deck_id',
      notes: 'id, deck_id, *tags',
      cards: 'id, note_id, deck_id',
      cardStates: 'id, user_id, card_id, due, [user_id+card_id]',
      reviewLogs: 'id, user_id, card_id, synced_at',
      syncQueue: '++id, table, created_at, attempts',
      syncMetadata: 'key',
      audioCache: 'id, noteId, cachedAt',
      userDeckSettings: 'id, user_id, deck_id, [user_id+deck_id]',
    })

    // Version 7: Add classes, classMembers, deckAssignments for SPA化
    this.version(7).stores({
      profiles: 'id',
      noteTypes: 'id',
      cardTemplates: 'id, note_type_id',
      decks: 'id, owner_id, parent_deck_id',
      notes: 'id, deck_id, *tags',
      cards: 'id, note_id, deck_id',
      cardStates: 'id, user_id, card_id, due, [user_id+card_id]',
      reviewLogs: 'id, user_id, card_id, synced_at',
      syncQueue: '++id, table, created_at, attempts',
      syncMetadata: 'key',
      audioCache: 'id, noteId, cachedAt',
      userDeckSettings: 'id, user_id, deck_id, [user_id+deck_id]',
      classes: 'id, teacher_id',
      classMembers: '[class_id+user_id], class_id, user_id',
      deckAssignments: 'id, deck_id, class_id, user_id',
    })

    // Version 8: Add FSRS fields to cardStates (no index change needed)
    this.version(8).stores({
      profiles: 'id',
      noteTypes: 'id',
      cardTemplates: 'id, note_type_id',
      decks: 'id, owner_id, parent_deck_id',
      notes: 'id, deck_id, *tags',
      cards: 'id, note_id, deck_id',
      cardStates: 'id, user_id, card_id, due, [user_id+card_id]',
      reviewLogs: 'id, user_id, card_id, synced_at',
      syncQueue: '++id, table, created_at, attempts',
      syncMetadata: 'key',
      audioCache: 'id, noteId, cachedAt',
      userDeckSettings: 'id, user_id, deck_id, [user_id+deck_id]',
      classes: 'id, teacher_id',
      classMembers: '[class_id+user_id], class_id, user_id',
      deckAssignments: 'id, deck_id, class_id, user_id',
    }).upgrade(tx => {
      // Set FSRS default values for existing card states
      return tx.table('cardStates').toCollection().modify(cs => {
        if (cs.stability === undefined) cs.stability = null
        if (cs.difficulty === undefined) cs.difficulty = null
        if (cs.elapsed_days === undefined) cs.elapsed_days = 0
        if (cs.scheduled_days === undefined) cs.scheduled_days = 0
        if (cs.last_review === undefined) cs.last_review = null
      })
    })

    // Version 9: Add filter_tags to decks (no index change needed)
    this.version(9).stores({
      profiles: 'id',
      noteTypes: 'id',
      cardTemplates: 'id, note_type_id',
      decks: 'id, owner_id, parent_deck_id',
      notes: 'id, deck_id, *tags',
      cards: 'id, note_id, deck_id',
      cardStates: 'id, user_id, card_id, due, [user_id+card_id]',
      reviewLogs: 'id, user_id, card_id, synced_at',
      syncQueue: '++id, table, created_at, attempts',
      syncMetadata: 'key',
      audioCache: 'id, noteId, cachedAt',
      userDeckSettings: 'id, user_id, deck_id, [user_id+deck_id]',
      classes: 'id, teacher_id',
      classMembers: '[class_id+user_id], class_id, user_id',
      deckAssignments: 'id, deck_id, class_id, user_id',
    }).upgrade(tx => {
      return tx.table('decks').toCollection().modify(deck => {
        if (deck.filter_tags === undefined) deck.filter_tags = []
      })
    })

    // Version 10: Add billing_template_id to classes for billing sync
    this.version(10).stores({
      profiles: 'id',
      noteTypes: 'id',
      cardTemplates: 'id, note_type_id',
      decks: 'id, owner_id, parent_deck_id',
      notes: 'id, deck_id, *tags',
      cards: 'id, note_id, deck_id',
      cardStates: 'id, user_id, card_id, due, [user_id+card_id]',
      reviewLogs: 'id, user_id, card_id, synced_at',
      syncQueue: '++id, table, created_at, attempts',
      syncMetadata: 'key',
      audioCache: 'id, noteId, cachedAt',
      userDeckSettings: 'id, user_id, deck_id, [user_id+deck_id]',
      classes: 'id, teacher_id, billing_template_id',
      classMembers: '[class_id+user_id], class_id, user_id',
      deckAssignments: 'id, deck_id, class_id, user_id',
    })

    // Version 11: Add deck_id to reviewLogs (no index change, field-only addition)
    this.version(11).stores({
      profiles: 'id',
      noteTypes: 'id',
      cardTemplates: 'id, note_type_id',
      decks: 'id, owner_id, parent_deck_id',
      notes: 'id, deck_id, *tags',
      cards: 'id, note_id, deck_id',
      cardStates: 'id, user_id, card_id, due, [user_id+card_id]',
      reviewLogs: 'id, user_id, card_id, synced_at',
      syncQueue: '++id, table, created_at, attempts',
      syncMetadata: 'key',
      audioCache: 'id, noteId, cachedAt',
      userDeckSettings: 'id, user_id, deck_id, [user_id+deck_id]',
      classes: 'id, teacher_id, billing_template_id',
      classMembers: '[class_id+user_id], class_id, user_id',
      deckAssignments: 'id, deck_id, class_id, user_id',
    })

    // Version 12: Add userCreatureState table for 記憶のいきもの育成（品種インプリント）
    this.version(12).stores({
      profiles: 'id',
      noteTypes: 'id',
      cardTemplates: 'id, note_type_id',
      decks: 'id, owner_id, parent_deck_id',
      notes: 'id, deck_id, *tags',
      cards: 'id, note_id, deck_id',
      cardStates: 'id, user_id, card_id, due, [user_id+card_id]',
      reviewLogs: 'id, user_id, card_id, synced_at',
      syncQueue: '++id, table, created_at, attempts',
      syncMetadata: 'key',
      audioCache: 'id, noteId, cachedAt',
      userDeckSettings: 'id, user_id, deck_id, [user_id+deck_id]',
      userCreatureState: 'id, user_id, note_id, [user_id+note_id]',
      classes: 'id, teacher_id, billing_template_id',
      classMembers: '[class_id+user_id], class_id, user_id',
      deckAssignments: 'id, deck_id, class_id, user_id',
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

// 記憶のいきもの育成（Phase 10.4）— 品種インプリントの Dexie ヘルパー

/** user_creature_state の複合キー */
export function createCreatureStateId(userId: string, noteId: string): string {
  return `${userId}:${noteId}`
}

/** ノートの品種インプリントを取得（未設定なら undefined） */
export async function getCreatureState(
  userId: string,
  noteId: string
): Promise<LocalUserCreatureState | undefined> {
  return db.userCreatureState.get(createCreatureStateId(userId, noteId))
}

/** 品種インプリントを保存（upsert・オフライン可） */
export async function saveCreatureState(
  userId: string,
  noteId: string,
  imprint: CreatureImprint,
  nickname: string | null = null
): Promise<void> {
  await db.userCreatureState.put({
    id: createCreatureStateId(userId, noteId),
    user_id: userId,
    note_id: noteId,
    imprint,
    nickname,
    updated_at: new Date(),
  })
}

/** ユーザーの全インプリントを note_id → imprint の Map で返す（庭の一括描画用） */
export async function getCreatureStatesMap(
  userId: string
): Promise<Map<string, CreatureImprint>> {
  const rows = await db.userCreatureState.where('user_id').equals(userId).toArray()
  return new Map(rows.map((r) => [r.note_id, r.imprint]))
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
      db.audioCache,
      db.userDeckSettings,
      db.userCreatureState,
      db.classes,
      db.classMembers,
      db.deckAssignments,
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
        db.audioCache.clear(),
        db.userDeckSettings.clear(),
        db.userCreatureState.clear(),
        db.classes.clear(),
        db.classMembers.clear(),
        db.deckAssignments.clear(),
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

// Audio cache helper functions

/**
 * Create composite key for audio cache
 */
export function createAudioCacheId(noteId: string, fieldName: string): string {
  return `${noteId}:${fieldName}`
}

/**
 * Get cached audio for a note field
 */
export async function getCachedAudio(
  noteId: string,
  fieldName: string
): Promise<AudioCacheEntry | undefined> {
  const id = createAudioCacheId(noteId, fieldName)
  return db.audioCache.get(id)
}

/**
 * Save audio to cache
 */
export async function saveAudioCache(
  noteId: string,
  fieldName: string,
  audioBlob: Blob,
  audioUrl: string
): Promise<void> {
  const id = createAudioCacheId(noteId, fieldName)
  await db.audioCache.put({
    id,
    noteId,
    fieldName,
    audioBlob,
    audioUrl,
    cachedAt: new Date(),
  })
}

/**
 * Delete cached audio for a note
 */
export async function deleteCachedAudioForNote(noteId: string): Promise<void> {
  await db.audioCache.where('noteId').equals(noteId).delete()
}

/**
 * Cleanup old audio cache entries (older than 30 days)
 */
export async function cleanupOldAudioCache(): Promise<number> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const oldEntries = await db.audioCache
    .filter((entry) => entry.cachedAt < thirtyDaysAgo)
    .toArray()

  const ids = oldEntries.map((entry) => entry.id)
  await db.audioCache.bulkDelete(ids)

  return ids.length
}

// Offline statistics helper functions

export interface OfflineStats {
  dailyReviews: Array<{ date: string; total: number; correct: number; incorrect: number }>
  cardDistribution: { new: number; learning: number; review: number; relearning: number; suspended: number }
  accuracyTrend: Array<{ date: string; accuracy: number }>
  totalReviews: number
  overallAccuracy: number
  streak: number
}

/**
 * Calculate statistics from local IndexedDB data
 */
export async function getOfflineStats(
  userId: string,
  days: number = 30
): Promise<OfflineStats> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  startDate.setHours(0, 0, 0, 0)

  // Get all review logs in the period
  const allReviewLogs = await db.reviewLogs
    .where('user_id')
    .equals(userId)
    .filter((log) => log.reviewed_at >= startDate)
    .toArray()

  // Get all card states
  const allCardStates = await db.cardStates
    .where('user_id')
    .equals(userId)
    .toArray()

  // Get all cards count
  const allCards = await db.cards.toArray()
  const totalCards = allCards.length

  // Calculate daily reviews
  const dailyReviews = calculateLocalDailyReviews(allReviewLogs, days)

  // Calculate card distribution
  const cardDistribution = calculateLocalCardDistribution(allCardStates, totalCards)

  // Calculate accuracy trend
  const accuracyTrend = calculateLocalAccuracyTrend(allReviewLogs, days)

  // Calculate overall stats
  const totalReviews = allReviewLogs.length
  const correctReviews = allReviewLogs.filter((r) => r.ease >= 3).length
  const overallAccuracy = totalReviews > 0 ? Math.round((correctReviews / totalReviews) * 100) : 0

  // Calculate streak
  const streak = calculateLocalStreak(allReviewLogs)

  return {
    dailyReviews,
    cardDistribution,
    accuracyTrend,
    totalReviews,
    overallAccuracy,
    streak,
  }
}

function calculateLocalDailyReviews(
  reviewLogs: LocalReviewLog[],
  days: number
): Array<{ date: string; total: number; correct: number; incorrect: number }> {
  const dailyMap = new Map<string, { total: number; correct: number; incorrect: number }>()

  // Initialize all days
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    dailyMap.set(dateStr, { total: 0, correct: 0, incorrect: 0 })
  }

  // Aggregate reviews
  for (const log of reviewLogs) {
    const dateStr = log.reviewed_at.toISOString().split('T')[0]
    const entry = dailyMap.get(dateStr)
    if (entry) {
      entry.total++
      if (log.ease >= 3) {
        entry.correct++
      } else {
        entry.incorrect++
      }
    }
  }

  return Array.from(dailyMap.entries()).map(([date, data]) => ({
    date,
    ...data,
  }))
}

function calculateLocalCardDistribution(
  cardStates: LocalCardState[],
  totalCards: number
): { new: number; learning: number; review: number; relearning: number; suspended: number } {
  const stateCount = {
    new: 0,
    learning: 0,
    review: 0,
    relearning: 0,
    suspended: 0,
  }

  for (const cs of cardStates) {
    if (cs.state === 'learning') stateCount.learning++
    else if (cs.state === 'review') stateCount.review++
    else if (cs.state === 'relearning') stateCount.relearning++
    else if (cs.state === 'suspended') stateCount.suspended++
  }

  // Cards without state are "new"
  stateCount.new = Math.max(0, totalCards - cardStates.length)

  return stateCount
}

function calculateLocalAccuracyTrend(
  reviewLogs: LocalReviewLog[],
  days: number
): Array<{ date: string; accuracy: number }> {
  const dailyMap = new Map<string, { correct: number; total: number }>()

  // Initialize all days
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    dailyMap.set(dateStr, { correct: 0, total: 0 })
  }

  // Aggregate reviews
  for (const log of reviewLogs) {
    const dateStr = log.reviewed_at.toISOString().split('T')[0]
    const entry = dailyMap.get(dateStr)
    if (entry) {
      entry.total++
      if (log.ease >= 3) {
        entry.correct++
      }
    }
  }

  return Array.from(dailyMap.entries()).map(([date, data]) => ({
    date,
    accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
  }))
}

// Offline study card data type (matches server-side CardData)
export interface OfflineCardData {
  id: string
  noteId: string
  fieldValues: Record<string, string>
  audioUrls: Record<string, string> | null
  generatedContent: GeneratedContent | null
  template: {
    front: string
    back: string
    css: string
  }
  fields?: FieldDefinition[]
  clozeNumber?: number
  createdAt?: string
  schedule: CardSchedule
}

/**
 * Get study cards from IndexedDB (offline equivalent of server getStudyCards)
 */
export async function getStudyCardsOffline(
  userId: string,
  deckId: string
): Promise<OfflineCardData[]> {
  const now = new Date()

  // Get current deck info (for filter_tags)
  const currentDeck = await db.decks.get(deckId)

  // Resolve root deck for centralized new-card quota
  const rootDeckId = await getRootDeckId(deckId)
  const isRootDeck = rootDeckId === deckId

  // For filter decks (subdecks with filter_tags), fetch cards from the root tree
  // because cards belong to the parent deck, not the filter subdeck
  const filterTags = currentDeck?.filter_tags || []
  const isFilterDeck = filterTags.length > 0 && !isRootDeck

  let allDeckIds: string[]
  if (isFilterDeck) {
    // Filter deck: get cards from entire root tree
    const rootDescendantIds = await getDescendantDeckIds(rootDeckId)
    allDeckIds = [rootDeckId, ...rootDescendantIds]
  } else {
    // Normal deck: get cards from this deck and its subdecks
    const descendantIds = await getDescendantDeckIds(deckId)
    allDeckIds = [deckId, ...descendantIds]
  }

  // Get all cards in the deck tree
  const deckCards = await db.cards.where('deck_id').anyOf(allDeckIds).toArray()
  if (deckCards.length === 0) return []

  // Get notes for these cards
  const noteIds = Array.from(new Set(deckCards.map(c => c.note_id)))
  const notes = await db.notes.where('id').anyOf(noteIds).toArray()
  const noteMap = new Map(notes.map(n => [n.id, n]))

  // Get note types
  const noteTypeIds = Array.from(new Set(notes.map(n => n.note_type_id)))
  const noteTypes = await db.noteTypes.where('id').anyOf(noteTypeIds).toArray()
  const fieldsMap = new Map<string, FieldDefinition[]>()
  for (const nt of noteTypes) {
    fieldsMap.set(nt.id, nt.fields as FieldDefinition[])
  }

  // Get card templates
  const templates = await db.cardTemplates.where('note_type_id').anyOf(noteTypeIds).toArray()
  const templateMap = new Map<string, Array<{ front: string; back: string; css: string }>>()
  for (const t of templates.sort((a, b) => a.ordinal - b.ordinal)) {
    const existing = templateMap.get(t.note_type_id) || []
    existing.push({
      front: t.front_template,
      back: t.back_template,
      css: t.css || '',
    })
    templateMap.set(t.note_type_id, existing)
  }

  // Get card states for this user
  const cardIds = deckCards.map(c => c.id)
  const states = await db.cardStates
    .where('user_id')
    .equals(userId)
    .filter(s => cardIds.includes(s.card_id))
    .toArray()
  const stateMap = new Map(states.map(s => [s.card_id, s]))

  // Get deck settings from ROOT deck (new_cards_per_day is shared across all descendants)
  const rootDeck = isRootDeck ? currentDeck : await db.decks.get(rootDeckId)
  const userSettingsId = `${userId}:${rootDeckId}`
  const userDeckSetting = await db.userDeckSettings.get(userSettingsId).catch(() => undefined)
  const mergedDeckSettings = {
    ...(rootDeck?.settings || {}),
    ...(userDeckSetting?.settings || {}),
  }
  const settings = resolveDeckSettings(mergedDeckSettings)

  // Count new cards introduced today across the ENTIRE root tree (shared quota)
  const todayStart = new Date()
  todayStart.setHours(4, 0, 0, 0)
  if (now.getHours() < 4) {
    todayStart.setDate(todayStart.getDate() - 1)
  }

  // For quota counting, use root tree card IDs (not just this subdeck)
  let allRootCardIds: string[]
  if (isRootDeck) {
    allRootCardIds = cardIds
  } else {
    const rootDescendantIds = await getDescendantDeckIds(rootDeckId)
    const allRootDeckIds = [rootDeckId, ...rootDescendantIds]
    const allRootCards = await db.cards.where('deck_id').anyOf(allRootDeckIds).toArray()
    allRootCardIds = allRootCards.map(c => c.id)
  }

  const todayLogs = await db.reviewLogs
    .where('user_id')
    .equals(userId)
    .filter(log =>
      allRootCardIds.includes(log.card_id) &&
      log.reviewed_at >= todayStart
    )
    .toArray()

  const newCardLogs = todayLogs.filter(l => l.last_interval === 0)
  const reviewCardLogs = todayLogs.filter(l => l.last_interval > 0 && cardIds.includes(l.card_id))
  const remainingNewCards = Math.max(0, settings.new_cards_per_day - newCardLogs.length)

  // Categorize cards
  const dueCards: OfflineCardData[] = []
  const newCards: OfflineCardData[] = []

  for (const card of deckCards) {
    const note = noteMap.get(card.note_id)
    if (!note) continue

    const state = stateMap.get(card.id)

    // Skip suspended cards
    if (state?.state === 'suspended') continue

    const cardTemplates = templateMap.get(note.note_type_id) || []
    const template = cardTemplates[card.template_index] || {
      front: '<div>{{Front}}</div>',
      back: '<div>{{Front}}</div><hr><div>{{Back}}</div>',
      css: '',
    }

    const cardData: OfflineCardData = {
      id: card.id,
      noteId: note.id,
      fieldValues: note.field_values,
      audioUrls: note.audio_urls || null,
      generatedContent: note.generated_content || null,
      template,
      fields: fieldsMap.get(note.note_type_id),
      schedule: state ? {
        due: state.due,
        interval: state.interval,
        easeFactor: state.ease_factor,
        repetitions: state.repetitions,
        state: state.state as CardSchedule['state'],
        learningStep: state.learning_step,
        lapses: state.lapses ?? 0,
        stability: state.stability ?? null,
        difficulty: state.difficulty ?? null,
        elapsed_days: state.elapsed_days ?? 0,
        scheduled_days: state.scheduled_days ?? 0,
        last_review: state.last_review ?? null,
      } : {
        due: now,
        interval: 0,
        easeFactor: 2.5,
        repetitions: 0,
        state: 'new' as const,
        learningStep: 0,
        lapses: 0,
        stability: null,
        difficulty: null,
        elapsed_days: 0,
        scheduled_days: 0,
        last_review: null,
      },
    }

    if (!state || state.state === 'new') {
      newCards.push(cardData)
    } else if (state.due <= now) {
      dueCards.push(cardData)
    }
  }

  // Filter new cards by tags if this is a filter deck
  const filteredNewCards = filterTags.length > 0
    ? newCards.filter(card => {
        const note = noteMap.get(card.noteId)
        const noteTags = note?.tags || []
        return noteTags.some((t: string) => filterTags.includes(t))
      })
    : newCards

  return orderStudyCards(dueCards, filteredNewCards, remainingNewCards, reviewCardLogs.length, settings)
}

// Offline deck with stats type
export interface OfflineDeckWithStats {
  id: string
  name: string
  owner_id: string
  is_distributed: boolean
  parent_deck_id: string | null
  filter_tags: string[]
  is_own: boolean
  total_cards: number
  new_count: number
  learning_count: number
  review_count: number
  settings?: Partial<DeckSettings>
}

/**
 * Get decks with stats from IndexedDB (offline equivalent of server getDecksWithStats)
 */
export async function getDecksWithStatsOffline(
  userId: string
): Promise<OfflineDeckWithStats[]> {
  const allDecks = await db.decks.toArray()
  if (allDecks.length === 0) return []

  const deckIds = allDecks.map(d => d.id)

  // Get all cards
  const allCards = await db.cards.where('deck_id').anyOf(deckIds).toArray()

  // Get card states for this user
  const allCardStates = await db.cardStates
    .where('user_id')
    .equals(userId)
    .toArray()

  // Build lookup maps
  const cardsByDeck = new Map<string, string[]>()
  for (const card of allCards) {
    const list = cardsByDeck.get(card.deck_id) || []
    list.push(card.id)
    cardsByDeck.set(card.deck_id, list)
  }

  const stateByCard = new Map<string, string>()
  for (const cs of allCardStates) {
    stateByCard.set(cs.card_id, cs.state)
  }

  // Build note lookup for filter deck tag matching
  const allNotes = await db.notes.toArray()
  const noteMap = new Map(allNotes.map(n => [n.id, n]))
  const cardToNote = new Map<string, string>()
  for (const card of allCards) {
    cardToNote.set(card.id, card.note_id)
  }

  // Build deck parent map for root deck resolution
  const deckMap = new Map(allDecks.map(d => [d.id, d]))

  return allDecks.map(deck => {
    const filterTags = deck.filter_tags || []
    const isFilterDeck = filterTags.length > 0 && deck.parent_deck_id

    let cardIds: string[]

    if (isFilterDeck) {
      // Filter deck: count cards from parent deck that match filter tags
      // Walk up to find root deck
      let rootId = deck.parent_deck_id!
      while (true) {
        const parent = deckMap.get(rootId)
        if (!parent || !parent.parent_deck_id) break
        rootId = parent.parent_deck_id
      }

      // Get all cards from root tree
      const rootTreeIds = new Set<string>()
      const collectDescendants = (id: string) => {
        rootTreeIds.add(id)
        for (const d of allDecks) {
          if (d.parent_deck_id === id) collectDescendants(d.id)
        }
      }
      collectDescendants(rootId)

      // Filter cards by tags
      cardIds = []
      for (const treeId of Array.from(rootTreeIds)) {
        for (const cid of (cardsByDeck.get(treeId) || [])) {
          const noteId = cardToNote.get(cid)
          if (!noteId) continue
          const note = noteMap.get(noteId)
          const noteTags = note?.tags || []
          if (noteTags.some((t: string) => filterTags.includes(t))) {
            cardIds.push(cid)
          }
        }
      }
    } else {
      cardIds = cardsByDeck.get(deck.id) || []
    }

    let newCount = 0
    let learningCount = 0
    let reviewCount = 0

    for (const cardId of cardIds) {
      const state = stateByCard.get(cardId)
      if (!state || state === 'new') {
        newCount++
      } else if (state === 'learning' || state === 'relearning') {
        learningCount++
      } else if (state === 'review') {
        reviewCount++
      }
    }

    return {
      id: deck.id,
      name: deck.name,
      owner_id: deck.owner_id,
      is_distributed: deck.is_distributed,
      parent_deck_id: deck.parent_deck_id || null,
      filter_tags: deck.filter_tags || [],
      is_own: deck.owner_id === userId,
      total_cards: cardIds.length,
      new_count: newCount,
      learning_count: learningCount,
      review_count: reviewCount,
      settings: deck.settings as Partial<DeckSettings> | undefined,
    }
  })
}

/**
 * Update a note's field_values locally in IndexedDB
 */
export async function updateNoteLocally(noteId: string, fieldValues: Record<string, string>): Promise<void> {
  await db.notes.update(noteId, { field_values: fieldValues })
}

/**
 * Delete a note and all related local data (cards, card_states, review_logs, audioCache)
 */
export async function deleteNoteLocally(noteId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.notes, db.cards, db.cardStates, db.reviewLogs, db.audioCache],
    async () => {
      // Get cards for this note
      const cards = await db.cards.where('note_id').equals(noteId).toArray()
      const cardIds = cards.map(c => c.id)

      if (cardIds.length > 0) {
        // Delete card_states and review_logs for these cards
        await db.cardStates.where('card_id').anyOf(cardIds).delete()
        await db.reviewLogs.where('card_id').anyOf(cardIds).delete()
        // Delete cards
        await db.cards.where('note_id').equals(noteId).delete()
      }

      // Delete audio cache for this note
      await db.audioCache.where('noteId').equals(noteId).delete()
      // Delete the note itself
      await db.notes.delete(noteId)
    }
  )
}

/**
 * Delete multiple notes and all related local data
 */
export async function deleteNotesLocally(noteIds: string[]): Promise<void> {
  if (noteIds.length === 0) return

  await db.transaction(
    'rw',
    [db.notes, db.cards, db.cardStates, db.reviewLogs, db.audioCache],
    async () => {
      // Get all cards for these notes
      const cards = await db.cards.where('note_id').anyOf(noteIds).toArray()
      const cardIds = cards.map(c => c.id)

      if (cardIds.length > 0) {
        await db.cardStates.where('card_id').anyOf(cardIds).delete()
        await db.reviewLogs.where('card_id').anyOf(cardIds).delete()
        await db.cards.where('note_id').anyOf(noteIds).delete()
      }

      // Delete audio cache for these notes
      await db.audioCache.where('noteId').anyOf(noteIds).delete()
      // Delete the notes
      await db.notes.bulkDelete(noteIds)
    }
  )
}

/**
 * Delete a deck and all related local data (notes, cards, card_states, review_logs, audioCache)
 */
export async function deleteDeckLocally(deckId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.decks, db.notes, db.cards, db.cardStates, db.reviewLogs, db.audioCache],
    async () => {
      // Get all notes in the deck
      const notes = await db.notes.where('deck_id').equals(deckId).toArray()
      const noteIds = notes.map(n => n.id)

      // Get all cards in the deck
      const cards = await db.cards.where('deck_id').equals(deckId).toArray()
      const cardIds = cards.map(c => c.id)

      if (cardIds.length > 0) {
        await db.cardStates.where('card_id').anyOf(cardIds).delete()
        await db.reviewLogs.where('card_id').anyOf(cardIds).delete()
        await db.cards.where('deck_id').equals(deckId).delete()
      }

      if (noteIds.length > 0) {
        await db.audioCache.where('noteId').anyOf(noteIds).delete()
        await db.notes.where('deck_id').equals(deckId).delete()
      }

      await db.decks.delete(deckId)
    }
  )
}

/**
 * Get all descendant deck IDs from IndexedDB (recursive local search)
 */
export async function getDescendantDeckIds(deckId: string): Promise<string[]> {
  const result: string[] = []
  const queue = [deckId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const children = await db.decks.where('parent_deck_id').equals(currentId).toArray()
    for (const child of children) {
      result.push(child.id)
      queue.push(child.id)
    }
  }

  return result
}

/**
 * Walk up the parent chain to find the root (top-level) deck ID.
 * If the deck has no parent, it IS the root.
 */
export async function getRootDeckId(deckId: string): Promise<string> {
  let currentId = deckId
  while (true) {
    const deck = await db.decks.get(currentId)
    if (!deck || !deck.parent_deck_id) return currentId
    currentId = deck.parent_deck_id
  }
}

/**
 * Update a note's tags locally in IndexedDB
 */
export async function updateNoteTagsLocally(noteId: string, tags: string[]): Promise<void> {
  await db.notes.update(noteId, { tags })
}

function calculateLocalStreak(reviewLogs: LocalReviewLog[]): number {
  const reviewDates = new Set(
    reviewLogs.map((r) => {
      const d = r.reviewed_at
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    })
  )

  let streak = 0
  const checkDate = new Date()
  while (streak < 365) {
    const dateStr = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`
    if (reviewDates.has(dateStr)) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else if (streak === 0 && checkDate.toDateString() === new Date().toDateString()) {
      // Today might not have reviews yet, check yesterday
      checkDate.setDate(checkDate.getDate() - 1)
    } else {
      break
    }
  }

  return streak
}
