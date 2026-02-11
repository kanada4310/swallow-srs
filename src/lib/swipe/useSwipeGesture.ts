'use client'

import { useRef, useCallback, useState, useEffect } from 'react'

// === Pure functions (testable) ===

export type SwipeDirection = 'up' | 'down' | 'left' | 'right'

const DEADZONE = 15 // px — below this, no swipe detected
const THRESHOLD = 60 // px — at this distance, swipe is confirmed

/**
 * Detect swipe direction from delta x/y.
 * Returns null if within deadzone.
 */
export function detectDirection(
  dx: number,
  dy: number,
  deadzone: number = DEADZONE
): SwipeDirection | null {
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  if (absDx < deadzone && absDy < deadzone) return null

  if (absDx > absDy) {
    return dx > 0 ? 'right' : 'left'
  } else {
    return dy > 0 ? 'down' : 'up'
  }
}

/**
 * Calculate swipe progress (0.0 to 1.0+) in the locked direction.
 */
export function calculateProgress(
  dx: number,
  dy: number,
  direction: SwipeDirection,
  threshold: number = THRESHOLD
): number {
  let distance: number
  switch (direction) {
    case 'left':
      distance = Math.max(0, -dx)
      break
    case 'right':
      distance = Math.max(0, dx)
      break
    case 'up':
      distance = Math.max(0, -dy)
      break
    case 'down':
      distance = Math.max(0, dy)
      break
  }
  return distance / threshold
}

// === Swipe state for consumers ===

export interface SwipeState {
  active: boolean
  direction: SwipeDirection | null
  progress: number // 0.0 - 1.0+
  dx: number
  dy: number
}

const INITIAL_STATE: SwipeState = {
  active: false,
  direction: null,
  progress: 0,
  dx: 0,
  dy: 0,
}

interface SwipeOptions {
  enabled: boolean
  onSwipe: (direction: SwipeDirection) => void
}

/**
 * Custom hook for swipe gesture detection using Pointer Events.
 * Attach the returned ref to the swipeable element.
 */
export function useSwipeGesture(options: SwipeOptions) {
  const { enabled, onSwipe } = options
  const [swipeState, setSwipeState] = useState<SwipeState>(INITIAL_STATE)

  // Internal tracking refs (not state, to avoid re-renders during move)
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const lockedDirection = useRef<SwipeDirection | null>(null)
  const pointerId = useRef<number | null>(null)
  const elementRef = useRef<HTMLDivElement | null>(null)
  // Refs to track latest callback values without re-registering listeners
  const onSwipeRef = useRef(onSwipe)
  const enabledRef = useRef(enabled)

  useEffect(() => {
    onSwipeRef.current = onSwipe
  }, [onSwipe])

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!enabledRef.current) return
    // Only handle primary pointer (single touch)
    if (e.button !== 0) return

    startPos.current = { x: e.clientX, y: e.clientY }
    lockedDirection.current = null
    pointerId.current = e.pointerId
  }, [])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!startPos.current || pointerId.current !== e.pointerId) return

    const dx = e.clientX - startPos.current.x
    const dy = e.clientY - startPos.current.y

    // If we haven't locked a direction yet, try to detect one
    if (!lockedDirection.current) {
      const dir = detectDirection(dx, dy)
      if (!dir) return // Still in deadzone

      // Lock direction and capture pointer
      lockedDirection.current = dir
      const el = elementRef.current
      if (el) {
        try { el.setPointerCapture(e.pointerId) } catch { /* ignore */ }
      }
    }

    const progress = calculateProgress(dx, dy, lockedDirection.current)
    setSwipeState({
      active: true,
      direction: lockedDirection.current,
      progress,
      dx,
      dy,
    })
  }, [])

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (pointerId.current !== e.pointerId) return

    const dir = lockedDirection.current
    if (dir && startPos.current) {
      const dx = e.clientX - startPos.current.x
      const dy = e.clientY - startPos.current.y
      const progress = calculateProgress(dx, dy, dir)

      if (progress >= 1.0) {
        onSwipeRef.current(dir)
      }
    }

    // Reset
    startPos.current = null
    lockedDirection.current = null
    pointerId.current = null
    setSwipeState(INITIAL_STATE)

    // Release pointer capture
    const el = elementRef.current
    if (el) {
      try { el.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    }
  }, [])

  const handlePointerCancel = useCallback((e: PointerEvent) => {
    if (pointerId.current !== e.pointerId) return
    startPos.current = null
    lockedDirection.current = null
    pointerId.current = null
    setSwipeState(INITIAL_STATE)
  }, [])

  // Attach/detach listeners when ref is set
  const setRef = useCallback((node: HTMLDivElement | null) => {
    // Cleanup old element
    const prev = elementRef.current
    if (prev) {
      prev.removeEventListener('pointerdown', handlePointerDown)
      prev.removeEventListener('pointermove', handlePointerMove)
      prev.removeEventListener('pointerup', handlePointerUp)
      prev.removeEventListener('pointercancel', handlePointerCancel)
    }

    elementRef.current = node

    // Attach to new element
    if (node) {
      node.addEventListener('pointerdown', handlePointerDown)
      node.addEventListener('pointermove', handlePointerMove)
      node.addEventListener('pointerup', handlePointerUp)
      node.addEventListener('pointercancel', handlePointerCancel)
    }
  }, [handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel])

  return { ref: setRef, swipeState }
}
