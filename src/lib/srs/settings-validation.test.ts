import { describe, it, expect } from 'vitest'
import { validateDeckSettings } from './settings-validation'

describe('validateDeckSettings - timer fields', () => {
  describe('answer_time_limit', () => {
    it('should accept valid values (0, 30, 999)', () => {
      expect(validateDeckSettings({ answer_time_limit: 0 })).toEqual([])
      expect(validateDeckSettings({ answer_time_limit: 30 })).toEqual([])
      expect(validateDeckSettings({ answer_time_limit: 999 })).toEqual([])
    })

    it('should reject negative values', () => {
      const errors = validateDeckSettings({ answer_time_limit: -1 })
      expect(errors).toHaveLength(1)
      expect(errors[0].field).toBe('answer_time_limit')
    })

    it('should reject values over 999', () => {
      const errors = validateDeckSettings({ answer_time_limit: 1000 })
      expect(errors).toHaveLength(1)
      expect(errors[0].field).toBe('answer_time_limit')
    })

    it('should reject non-integer values', () => {
      const errors = validateDeckSettings({ answer_time_limit: 1.5 })
      expect(errors).toHaveLength(1)
      expect(errors[0].field).toBe('answer_time_limit')
    })
  })

  describe('timer_action', () => {
    it('should accept valid values', () => {
      expect(validateDeckSettings({ timer_action: 'flip' })).toEqual([])
      expect(validateDeckSettings({ timer_action: 'auto_again' })).toEqual([])
      expect(validateDeckSettings({ timer_action: 'none' })).toEqual([])
    })

    it('should reject invalid values', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errors = validateDeckSettings({ timer_action: 'invalid' as any })
      expect(errors).toHaveLength(1)
      expect(errors[0].field).toBe('timer_action')
    })
  })
})
