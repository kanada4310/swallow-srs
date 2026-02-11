import { describe, it, expect } from 'vitest'
import { detectDirection, calculateProgress } from './useSwipeGesture'

describe('detectDirection', () => {
  it('should return null when within deadzone', () => {
    expect(detectDirection(5, 5)).toBeNull()
    expect(detectDirection(-10, 10)).toBeNull()
    expect(detectDirection(0, 0)).toBeNull()
  })

  it('should detect right swipe', () => {
    expect(detectDirection(30, 5)).toBe('right')
    expect(detectDirection(100, 10)).toBe('right')
  })

  it('should detect left swipe', () => {
    expect(detectDirection(-30, 5)).toBe('left')
    expect(detectDirection(-100, -10)).toBe('left')
  })

  it('should detect up swipe', () => {
    expect(detectDirection(5, -30)).toBe('up')
    expect(detectDirection(-5, -100)).toBe('up')
  })

  it('should detect down swipe', () => {
    expect(detectDirection(5, 30)).toBe('down')
    expect(detectDirection(-5, 100)).toBe('down')
  })

  it('should prefer horizontal when |dx| > |dy|', () => {
    expect(detectDirection(25, -20)).toBe('right')
    expect(detectDirection(-25, 20)).toBe('left')
  })

  it('should prefer vertical when |dy| > |dx|', () => {
    expect(detectDirection(20, -25)).toBe('up')
    expect(detectDirection(-20, 25)).toBe('down')
  })

  it('should prefer vertical on equal distance (|dx| == |dy|)', () => {
    // When absDx === absDy, the else branch fires (vertical)
    expect(detectDirection(20, -20)).toBe('up')
    expect(detectDirection(20, 20)).toBe('down')
  })

  it('should respect custom deadzone', () => {
    expect(detectDirection(20, 5, 25)).toBeNull()
    expect(detectDirection(30, 5, 25)).toBe('right')
  })

  it('should handle motion at exact deadzone boundary', () => {
    // At exactly deadzone on one axis and 0 on the other, the < check on the 0 axis passes
    // but the deadzone axis equals deadzone (not <), so it proceeds to direction detection
    expect(detectDirection(15, 0, 15)).toBe('right')
    // Just above deadzone
    expect(detectDirection(16, 0, 15)).toBe('right')
    // Both axes below deadzone
    expect(detectDirection(14, 14, 15)).toBeNull()
  })
})

describe('calculateProgress', () => {
  it('should return 0 when moving opposite to locked direction', () => {
    expect(calculateProgress(30, 0, 'left')).toBe(0)
    expect(calculateProgress(-30, 0, 'right')).toBe(0)
    expect(calculateProgress(0, 30, 'up')).toBe(0)
    expect(calculateProgress(0, -30, 'down')).toBe(0)
  })

  it('should return 1.0 at threshold distance', () => {
    expect(calculateProgress(-60, 0, 'left')).toBe(1.0)
    expect(calculateProgress(60, 0, 'right')).toBe(1.0)
    expect(calculateProgress(0, -60, 'up')).toBe(1.0)
    expect(calculateProgress(0, 60, 'down')).toBe(1.0)
  })

  it('should return 0.5 at half threshold', () => {
    expect(calculateProgress(-30, 0, 'left')).toBe(0.5)
    expect(calculateProgress(30, 0, 'right')).toBe(0.5)
  })

  it('should exceed 1.0 beyond threshold', () => {
    expect(calculateProgress(-120, 0, 'left')).toBe(2.0)
  })

  it('should respect custom threshold', () => {
    expect(calculateProgress(-40, 0, 'left', 80)).toBe(0.5)
    expect(calculateProgress(-80, 0, 'left', 80)).toBe(1.0)
  })
})
