'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface UseDexieQueryOptions<T> {
  /** Query IndexedDB for local data (instant) */
  localQuery: () => Promise<T | null>
  /** Query server for fresh data */
  remoteQuery?: () => Promise<T | null>
  /** Save remote data to IndexedDB */
  saveToLocal?: (data: T) => Promise<void>
  /** Dependencies array - re-run when these change */
  deps?: unknown[]
  /** Whether to run the query */
  enabled?: boolean
}

interface UseDexieQueryResult<T> {
  data: T | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Stale-while-revalidate hook for Dexie.js + server data.
 *
 * 1. Run localQuery() → if data exists, show immediately (isLoading=false)
 * 2. In parallel, run remoteQuery() → save to local → update state
 * 3. If local is empty, wait for remote (isLoading=true until remote completes)
 */
export function useDexieQuery<T>({
  localQuery,
  remoteQuery,
  saveToLocal,
  deps = [],
  enabled = true,
}: UseDexieQueryOptions<T>): UseDexieQueryResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const execute = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false)
      return
    }

    setError(null)
    let hasLocalData = false

    // Step 1: Load from IndexedDB (instant)
    try {
      const localData = await localQuery()
      if (localData !== null && mountedRef.current) {
        setData(localData)
        hasLocalData = true
        setIsLoading(false)
      }
    } catch (err) {
      console.error('Local query error:', err)
    }

    // Step 2: Fetch from server (background)
    if (remoteQuery) {
      if (hasLocalData) {
        setIsRefreshing(true)
      }

      try {
        const remoteData = await remoteQuery()
        if (remoteData !== null && mountedRef.current) {
          setData(remoteData)
          // Save to IndexedDB for next time
          if (saveToLocal) {
            try {
              await saveToLocal(remoteData)
            } catch (err) {
              console.error('Failed to save to local:', err)
            }
          }
        }
      } catch (err) {
        // Only set error if we had no local data
        if (!hasLocalData && mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to fetch data')
        }
      } finally {
        if (mountedRef.current) {
          setIsRefreshing(false)
          setIsLoading(false)
        }
      }
    } else {
      // No remote query - just local
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])

  useEffect(() => {
    mountedRef.current = true
    execute()
    return () => {
      mountedRef.current = false
    }
  }, [execute])

  const refresh = useCallback(async () => {
    await execute()
  }, [execute])

  return { data, isLoading, isRefreshing, error, refresh }
}
