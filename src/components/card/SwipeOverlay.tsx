'use client'

import type { SwipeDirection, SwipeState } from '@/lib/swipe/useSwipeGesture'

interface SwipeOverlayProps {
  swipeState: SwipeState
  isFlipped: boolean
  intervalPreviews?: Record<number, string> // Ease → interval string
}

interface DirectionConfig {
  color: string
  label: string
  icon: 'up' | 'down' | 'left' | 'right'
}

function getDirectionConfig(
  direction: SwipeDirection,
  isFlipped: boolean
): DirectionConfig {
  if (!isFlipped) {
    // Front side: only up = flip
    return { color: 'bg-blue-600', label: '答えを見る', icon: 'up' }
  }

  switch (direction) {
    case 'left':
      return { color: 'bg-red-500', label: 'もう一度', icon: 'left' }
    case 'down':
      return { color: 'bg-orange-500', label: '難しい', icon: 'down' }
    case 'right':
      return { color: 'bg-green-500', label: '正解', icon: 'right' }
    case 'up':
      return { color: 'bg-blue-500', label: '簡単', icon: 'up' }
  }
}

function getIntervalForDirection(
  direction: SwipeDirection,
  intervalPreviews?: Record<number, string>
): string | null {
  if (!intervalPreviews) return null
  // Ease: 1=Again, 2=Hard, 3=Good, 4=Easy
  switch (direction) {
    case 'left': return intervalPreviews[1] || null
    case 'down': return intervalPreviews[2] || null
    case 'right': return intervalPreviews[3] || null
    case 'up': return intervalPreviews[4] || null
  }
}

function ChevronIcon({ direction }: { direction: 'up' | 'down' | 'left' | 'right' }) {
  const paths: Record<string, string> = {
    up: 'M18 15l-6-6-6 6',
    down: 'M6 9l6 6 6-6',
    left: 'M15 18l-6-6 6-6',
    right: 'M9 18l6-6-6-6',
  }

  return (
    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={paths[direction]} />
    </svg>
  )
}

export function SwipeOverlay({ swipeState, isFlipped, intervalPreviews }: SwipeOverlayProps) {
  if (!swipeState.active || !swipeState.direction) return null

  // On front side, only show overlay for up swipe
  if (!isFlipped && swipeState.direction !== 'up') return null

  const config = getDirectionConfig(swipeState.direction, isFlipped)
  const interval = isFlipped ? getIntervalForDirection(swipeState.direction, intervalPreviews) : null
  const opacity = Math.min(0.7, swipeState.progress * 0.7)

  return (
    <div
      className={`absolute inset-0 ${config.color} rounded-xl flex flex-col items-center justify-center pointer-events-none z-10 transition-opacity duration-75`}
      style={{ opacity }}
    >
      <div className="text-white">
        <ChevronIcon direction={config.icon} />
      </div>
      <span className="text-white text-lg font-bold mt-1">{config.label}</span>
      {interval && (
        <span className="text-white text-sm opacity-90 mt-0.5">{interval}</span>
      )}
    </div>
  )
}
