/**
 * ユーティリティ関数 - オンライン検出など
 */

type OnlineListener = (online: boolean) => void
const listeners: Set<OnlineListener> = new Set()

/**
 * Check if the browser is currently online
 */
export function isOnline(): boolean {
  if (typeof navigator === 'undefined') {
    return true // SSR: assume online
  }
  return navigator.onLine
}

/**
 * Wait for the browser to come online
 */
export function waitForOnline(timeout?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isOnline()) {
      resolve()
      return
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const handleOnline = () => {
      if (timeoutId) clearTimeout(timeoutId)
      window.removeEventListener('online', handleOnline)
      resolve()
    }

    window.addEventListener('online', handleOnline)

    if (timeout) {
      timeoutId = setTimeout(() => {
        window.removeEventListener('online', handleOnline)
        reject(new Error('Timeout waiting for online'))
      }, timeout)
    }
  })
}

/**
 * Register a listener for online/offline status changes
 */
export function registerOnlineListener(listener: OnlineListener): () => void {
  listeners.add(listener)

  // Set up event listeners if this is the first listener
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
  }

  // Return cleanup function
  return () => {
    listeners.delete(listener)

    // Remove event listeners if no more listeners
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }
}

function handleOnline() {
  listeners.forEach((listener) => listener(true))
}

function handleOffline() {
  listeners.forEach((listener) => listener(false))
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    initialDelay?: number
    maxDelay?: number
    onRetry?: (attempt: number, error: Error) => void
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    onRetry,
  } = options

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxRetries) {
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay)
        onRetry?.(attempt + 1, lastError)
        await sleep(delay)
      }
    }
  }

  throw lastError
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Convert server timestamp to Date
 */
export function parseServerDate(timestamp: string): Date {
  return new Date(timestamp)
}

/**
 * Format Date for server
 */
export function formatForServer(date: Date): string {
  return date.toISOString()
}

/**
 * Compare two dates for sync conflict detection
 */
export function isNewerThan(date1: Date, date2: Date): boolean {
  return date1.getTime() > date2.getTime()
}

/**
 * Merge two objects, preferring newer values based on updated_at
 */
export function mergeWithNewer<T extends { updated_at: Date }>(
  local: T,
  server: T
): { merged: T; hasConflict: boolean } {
  const localNewer = isNewerThan(local.updated_at, server.updated_at)
  const serverNewer = isNewerThan(server.updated_at, local.updated_at)

  if (localNewer) {
    return { merged: local, hasConflict: false }
  }

  if (serverNewer) {
    return { merged: server, hasConflict: false }
  }

  // Same timestamp - check if values are different
  const localJson = JSON.stringify({ ...local, updated_at: null })
  const serverJson = JSON.stringify({ ...server, updated_at: null })

  if (localJson !== serverJson) {
    return { merged: server, hasConflict: true }
  }

  return { merged: server, hasConflict: false }
}
