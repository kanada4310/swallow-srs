/**
 * React Hooks for オフラインDB操作
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { isOnline, registerOnlineListener } from './utils'
import {
  getSyncStatus,
  subscribeSyncStatus,
  syncWithServer,
  initSync,
  type SyncStatus,
} from './sync'
import { db, type LocalCardState } from './schema'

/**
 * Hook for online/offline status
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    // Set initial value
    setOnline(isOnline())

    // Subscribe to changes
    const unsubscribe = registerOnlineListener((isOnline) => {
      setOnline(isOnline)
    })

    return unsubscribe
  }, [])

  return online
}

/**
 * Hook for sync status
 */
export function useSyncStatus(): SyncStatus & {
  sync: (userId: string) => Promise<void>
} {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus)

  useEffect(() => {
    // Initialize sync on mount
    initSync()

    // Subscribe to status changes
    const unsubscribe = subscribeSyncStatus(setStatus)

    return unsubscribe
  }, [])

  const sync = useCallback(async (userId: string) => {
    await syncWithServer(userId)
  }, [])

  return { ...status, sync }
}

/**
 * Hook for accessing local database
 */
export function useLocalDb() {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Check if IndexedDB is available
    const checkDb = async () => {
      try {
        await db.open()
        setIsReady(true)
      } catch (error) {
        console.error('Failed to open IndexedDB:', error)
        setIsReady(false)
      }
    }

    checkDb()
  }, [])

  return { db, isReady }
}

/**
 * Hook for loading cards from local DB for offline study
 */
export function useOfflineCards(
  userId: string | null,
  deckId: string | null
): {
  cards: LocalCardState[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
} {
  const [cards, setCards] = useState<LocalCardState[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadCards = useCallback(async () => {
    if (!userId || !deckId) {
      setCards([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Get all cards in the deck
      const deckCards = await db.cards.where('deck_id').equals(deckId).toArray()
      const cardIds = deckCards.map((c) => c.id)

      // Get card states for this user
      const now = new Date()
      const states = await db.cardStates
        .where('user_id')
        .equals(userId)
        .filter((s) => cardIds.includes(s.card_id) && s.due <= now)
        .toArray()

      setCards(states)
    } catch (err) {
      console.error('Failed to load offline cards:', err)
      setError(err instanceof Error ? err.message : 'Failed to load cards')
    } finally {
      setIsLoading(false)
    }
  }, [userId, deckId])

  useEffect(() => {
    loadCards()
  }, [loadCards])

  return { cards, isLoading, error, refresh: loadCards }
}

/**
 * Hook for auto-syncing when coming back online
 */
export function useAutoSync(userId: string | null) {
  const online = useOnlineStatus()
  const { pendingCount, sync } = useSyncStatus()

  useEffect(() => {
    // Only sync if:
    // - We have a user ID
    // - We just came online
    // - There are pending changes
    if (userId && online && pendingCount > 0) {
      sync(userId).catch((error) => {
        console.error('Auto-sync failed:', error)
      })
    }
  }, [online, userId, pendingCount, sync])
}

/**
 * Hook for conflict resolution
 */
export function useConflicts() {
  const { conflicts } = useSyncStatus()

  const hasConflicts = conflicts.length > 0

  return {
    conflicts,
    hasConflicts,
  }
}

/**
 * Hook to get deck data from local DB
 */
export function useLocalDeck(deckId: string | null) {
  const [deck, setDeck] = useState<{
    id: string
    name: string
    settings: { new_cards_per_day: number }
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!deckId) {
      setDeck(null)
      setIsLoading(false)
      return
    }

    const loadDeck = async () => {
      setIsLoading(true)
      try {
        const localDeck = await db.decks.get(deckId)
        setDeck(localDeck ?? null)
      } catch (error) {
        console.error('Failed to load deck from local DB:', error)
        setDeck(null)
      } finally {
        setIsLoading(false)
      }
    }

    loadDeck()
  }, [deckId])

  return { deck, isLoading }
}

/**
 * Hook to prefetch deck data for offline use
 */
export function usePrefetchDeck(deckId: string | null) {
  const online = useOnlineStatus()

  useEffect(() => {
    if (!deckId || !online) return

    const prefetch = async () => {
      try {
        // Fetch deck data from server and store locally
        const response = await fetch(`/api/decks/${deckId}/offline-data`)
        if (!response.ok) return

        const data = await response.json()

        await db.transaction(
          'rw',
          [db.decks, db.notes, db.cards, db.noteTypes, db.cardTemplates, db.cardStates],
          async () => {
            if (data.deck) await db.decks.put(data.deck)
            if (data.notes) await db.notes.bulkPut(data.notes)
            if (data.cards) await db.cards.bulkPut(data.cards)
            if (data.noteTypes) await db.noteTypes.bulkPut(data.noteTypes)
            if (data.cardTemplates) await db.cardTemplates.bulkPut(data.cardTemplates)
            if (data.cardStates) {
              // Convert server card states to local format
              for (const cs of data.cardStates) {
                const id = `${cs.user_id}:${cs.card_id}`
                await db.cardStates.put({
                  id,
                  user_id: cs.user_id,
                  card_id: cs.card_id,
                  due: new Date(cs.due),
                  interval: cs.interval,
                  ease_factor: cs.ease_factor,
                  repetitions: cs.repetitions,
                  state: cs.state,
                  learning_step: cs.learning_step,
                  updated_at: new Date(cs.updated_at),
                })
              }
            }
          }
        )
      } catch (error) {
        console.error('Failed to prefetch deck data:', error)
      }
    }

    prefetch()
  }, [deckId, online])
}

/**
 * Hook to prefetch multiple decks for offline use (batch)
 */
export function usePrefetchAllDecks(deckIds: string[]) {
  const online = useOnlineStatus()
  const prefetchedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!online || deckIds.length === 0) return

    // Only prefetch decks we haven't prefetched yet in this session
    const newDeckIds = deckIds.filter(id => !prefetchedRef.current.has(id))
    if (newDeckIds.length === 0) return

    const prefetchAll = async () => {
      for (const deckId of newDeckIds) {
        try {
          const response = await fetch(`/api/decks/${deckId}/offline-data`)
          if (!response.ok) continue

          const data = await response.json()

          await db.transaction(
            'rw',
            [db.decks, db.notes, db.cards, db.noteTypes, db.cardTemplates, db.cardStates],
            async () => {
              if (data.deck) await db.decks.put(data.deck)
              if (data.notes) await db.notes.bulkPut(data.notes)
              if (data.cards) await db.cards.bulkPut(data.cards)
              if (data.noteTypes) await db.noteTypes.bulkPut(data.noteTypes)
              if (data.cardTemplates) await db.cardTemplates.bulkPut(data.cardTemplates)
              if (data.cardStates) {
                for (const cs of data.cardStates) {
                  const id = `${cs.user_id}:${cs.card_id}`
                  await db.cardStates.put({
                    id,
                    user_id: cs.user_id,
                    card_id: cs.card_id,
                    due: new Date(cs.due),
                    interval: cs.interval,
                    ease_factor: cs.ease_factor,
                    repetitions: cs.repetitions,
                    state: cs.state,
                    learning_step: cs.learning_step,
                    updated_at: new Date(cs.updated_at),
                  })
                }
              }
            }
          )

          prefetchedRef.current.add(deckId)
        } catch (error) {
          console.error(`Failed to prefetch deck ${deckId}:`, error)
        }
      }
    }

    prefetchAll()
  }, [deckIds.join(','), online]) // eslint-disable-line react-hooks/exhaustive-deps
}
