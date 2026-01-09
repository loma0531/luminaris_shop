import { describe, it, expect } from 'vitest'
import {
  isValidObjectId,
  isValidMinecraftName,
  isValidEmail,
  sanitizeString,
  validatePrice,
  validatePagination,
  isValidOrderStatus,
  isValidPaymentStatus,
  sanitizeCommands
} from './inputValidation'

describe('inputValidation', () => {
  describe('isValidObjectId', () => {
    it('accepts valid MongoDB ObjectIds', () => {
      expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true)
      expect(isValidObjectId('6753a1b2c3d4e5f6a7b8c9d0')).toBe(true)
    })

    it('rejects invalid ObjectIds', () => {
      expect(isValidObjectId('invalid-id')).toBe(false)
      expect(isValidObjectId('123')).toBe(false)
      expect(isValidObjectId('')).toBe(false)
      expect(isValidObjectId('507f1f77bcf86cd79943901g')).toBe(false) // invalid char
    })

    it('rejects non-string inputs', () => {
      expect(isValidObjectId(123 as unknown as string)).toBe(false)
      expect(isValidObjectId(null as unknown as string)).toBe(false)
    })
  })

  describe('isValidMinecraftName', () => {
    it('accepts valid Java Edition names', () => {
      expect(isValidMinecraftName('Steve')).toBe(true)
      expect(isValidMinecraftName('Alex_123')).toBe(true)
      expect(isValidMinecraftName('Player_Name')).toBe(true)
      expect(isValidMinecraftName('abc')).toBe(true) // min 3 chars
    })

    it('accepts valid Bedrock Edition names (BR_ prefix)', () => {
      expect(isValidMinecraftName('BR_Player')).toBe(true)
      expect(isValidMinecraftName('BR_MyName123')).toBe(true)
    })

    it('rejects invalid names', () => {
      expect(isValidMinecraftName('AB')).toBe(false) // too short
      expect(isValidMinecraftName('ThisNameIsWayTooLoooong')).toBe(false) // too long
      expect(isValidMinecraftName('Player@Name')).toBe(false) // invalid char
      expect(isValidMinecraftName('Player Name')).toBe(false) // space
      expect(isValidMinecraftName('')).toBe(false)
    })

    it('rejects non-string inputs', () => {
      expect(isValidMinecraftName(123 as unknown as string)).toBe(false)
    })
  })

  describe('isValidEmail', () => {
    it('accepts valid emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true)
      expect(isValidEmail('user.name@domain.co.th')).toBe(true)
      expect(isValidEmail('a@b.c')).toBe(true)
    })

    it('rejects invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false)
      expect(isValidEmail('missing@domain')).toBe(false)
      expect(isValidEmail('@no-local-part.com')).toBe(false)
      expect(isValidEmail('spaces in@email.com')).toBe(false)
    })
  })

  describe('sanitizeString', () => {
    it('trims whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello')
    })

    it('removes HTML brackets', () => {
      expect(sanitizeString('<script>alert(1)</script>')).toBe('scriptalert(1)/script')
    })

    it('removes javascript: protocol', () => {
      expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)')
    })

    it('removes event handlers', () => {
      expect(sanitizeString('onclick=evil()')).toBe('evil()')
    })

    it('removes data: URIs', () => {
      expect(sanitizeString('data:text/html,<script>evil</script>')).toBe('text/html,scriptevil/script')
    })

    it('respects max length', () => {
      const longString = 'a'.repeat(1000)
      expect(sanitizeString(longString, 100).length).toBe(100)
    })

    it('handles non-string inputs', () => {
      expect(sanitizeString(123 as unknown as string)).toBe('')
    })
  })

  describe('validatePrice', () => {
    it('returns valid prices', () => {
      expect(validatePrice(99)).toBe(99)
      expect(validatePrice(50)).toBe(50)
      expect(validatePrice('100')).toBe(100)
      expect(validatePrice(1)).toBe(1)
    })

    it('rounds to integer (Thai Baht)', () => {
      expect(validatePrice(99.99)).toBe(100)
      expect(validatePrice(1.234)).toBe(1)
    })

    it('rejects invalid prices', () => {
      expect(validatePrice(-10)).toBeNull()
      expect(validatePrice(0)).toBeNull()
      expect(validatePrice(1000001)).toBeNull() // exceeds max
      expect(validatePrice('invalid')).toBeNull()
      expect(validatePrice(NaN)).toBeNull()
      expect(validatePrice(Infinity)).toBeNull()
    })
  })

  describe('validatePagination', () => {
    it('returns valid pagination params', () => {
      const result = validatePagination(2, 20)
      expect(result.page).toBe(2)
      expect(result.limit).toBe(20)
      expect(result.skip).toBe(20)
    })

    it('uses defaults for invalid inputs', () => {
      const result = validatePagination(null, null)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(10)
      expect(result.skip).toBe(0)
    })

    it('enforces minimum page of 1', () => {
      const result = validatePagination(0, 10)
      expect(result.page).toBe(1)
    })

    it('enforces maximum limit', () => {
      const result = validatePagination(1, 200, 50)
      expect(result.limit).toBe(50)
    })

    it('handles string inputs', () => {
      const result = validatePagination('3', '25')
      expect(result.page).toBe(3)
      expect(result.limit).toBe(25)
    })
  })

  describe('isValidOrderStatus', () => {
    it('accepts valid order statuses', () => {
      expect(isValidOrderStatus('PENDING')).toBe(true)
      expect(isValidOrderStatus('AWAITING_PAYMENT')).toBe(true)
      expect(isValidOrderStatus('COMPLETED')).toBe(true)
      expect(isValidOrderStatus('CANCELLED')).toBe(true)
    })

    it('rejects invalid statuses', () => {
      expect(isValidOrderStatus('INVALID')).toBe(false)
      expect(isValidOrderStatus('pending')).toBe(false) // case sensitive
      expect(isValidOrderStatus('')).toBe(false)
    })
  })

  describe('isValidPaymentStatus', () => {
    it('accepts valid payment statuses', () => {
      expect(isValidPaymentStatus('PENDING')).toBe(true)
      expect(isValidPaymentStatus('VERIFIED')).toBe(true)
      expect(isValidPaymentStatus('REJECTED')).toBe(true)
    })

    it('rejects invalid statuses', () => {
      expect(isValidPaymentStatus('COMPLETED')).toBe(false)
      expect(isValidPaymentStatus('invalid')).toBe(false)
    })
  })

  describe('sanitizeCommands', () => {
    it('returns valid command strings', () => {
      const commands = ['give player diamond 1', 'say Hello']
      expect(sanitizeCommands(commands)).toEqual(['give player diamond 1', 'say Hello'])
    })

    it('trims commands', () => {
      expect(sanitizeCommands(['  give player item  '])).toEqual(['give player item'])
    })

    it('filters out non-strings', () => {
      expect(sanitizeCommands([123, null, 'valid command'])).toEqual(['valid command'])
    })

    it('filters out empty commands', () => {
      expect(sanitizeCommands(['', '  ', 'valid'])).toEqual(['valid'])
    })

    it('filters out commands exceeding max length', () => {
      const longCommand = 'a'.repeat(501)
      expect(sanitizeCommands([longCommand, 'short'])).toEqual(['short'])
    })

    it('returns empty array for non-array input', () => {
      expect(sanitizeCommands('not an array' as unknown as unknown[])).toEqual([])
    })
  })
})
