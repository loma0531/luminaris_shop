import { describe, it, expect } from 'vitest'
import {
  validateCustomInput,
  sanitizeCustomInput,
  replaceCustomInput,
  commandRequiresCustomInput,
} from '../inputValidation'

describe('validateCustomInput', () => {
  it('should accept valid simple color codes', () => {
    const result = validateCustomInput('&aTest')
    expect(result.valid).toBe(true)
  })

  it('should accept valid hex color codes', () => {
    const result = validateCustomInput('&x&F&F&0&0&0&0Test')
    expect(result.valid).toBe(true)
  })

  it('should accept complex gradient codes', () => {
    const code = '&x&8&6&6&4&F&FL&x&9&6&7&3&F&Fo&x&A&5&8&3&F&Em'
    const result = validateCustomInput(code)
    expect(result.valid).toBe(true)
  })

  it('should reject empty input', () => {
    expect(validateCustomInput('')).toEqual({ valid: false, error: 'กรุณากรอกข้อมูล' })
    expect(validateCustomInput('   ')).toEqual({ valid: false, error: 'กรุณากรอกข้อมูล' })
  })

  it('should reject null/undefined', () => {
    expect(validateCustomInput(null as unknown as string).valid).toBe(false)
    expect(validateCustomInput(undefined as unknown as string).valid).toBe(false)
  })

  it('should accept text without color markers (no longer requires & or #)', () => {
    const result = validateCustomInput('JustText')
    expect(result.valid).toBe(true)
  })

  it('should reject dangerous patterns - semicolon', () => {
    const result = validateCustomInput('&aTest;/op hacker')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('ไม่อนุญาต')
  })

  it('should reject dangerous patterns - newline', () => {
    const result = validateCustomInput('&aTest\n/op hacker')
    expect(result.valid).toBe(false)
  })

  it('should reject dangerous patterns - slash', () => {
    const result = validateCustomInput('&aTest/op hacker')
    expect(result.valid).toBe(false)
  })

  it('should reject dangerous patterns - brackets', () => {
    const result = validateCustomInput('&a{player}')
    expect(result.valid).toBe(false)
  })

  it('should reject too long input', () => {
    const longCode = '&a' + 'A'.repeat(2050)
    const result = validateCustomInput(longCode)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('ยาวเกินไป')
  })
})

describe('sanitizeCustomInput', () => {
  it('should trim whitespace', () => {
    expect(sanitizeCustomInput('  &aTest  ')).toBe('&aTest')
  })

  it('should remove dangerous characters', () => {
    expect(sanitizeCustomInput('&aTest;/op')).toBe('&aTestop')
  })

  it('should handle null/undefined', () => {
    expect(sanitizeCustomInput(null as unknown as string)).toBe('')
    expect(sanitizeCustomInput(undefined as unknown as string)).toBe('')
  })

  it('should truncate long input', () => {
    const longCode = '&a' + 'A'.repeat(2050)
    const result = sanitizeCustomInput(longCode)
    expect(result.length).toBeLessThanOrEqual(2000)
  })
})

describe('replaceCustomInput', () => {
  it('should replace {customInput} with value', () => {
    const cmd = 'cmi nick {player} {customInput}'
    const result = replaceCustomInput(cmd, '&aTest')
    expect(result).toBe('cmi nick {player} &aTest')
  })

  it('should handle case insensitive placeholder', () => {
    const cmd = 'cmi nick {player} {CUSTOMINPUT}'
    const result = replaceCustomInput(cmd, '&aTest')
    expect(result).toBe('cmi nick {player} &aTest')
  })

  it('should sanitize input before replacement', () => {
    const cmd = 'cmi nick {player} {customInput}'
    const result = replaceCustomInput(cmd, '&aTest;/op')
    expect(result).toBe('cmi nick {player} &aTestop')
    expect(result).not.toContain(';')
  })

  it('should handle null command', () => {
    expect(replaceCustomInput(null as unknown as string, '&aTest')).toBe(null)
  })
})

describe('commandRequiresCustomInput', () => {
  it('should return true when command has {customInput}', () => {
    const commands = ['cmi nick {player} {customInput}']
    expect(commandRequiresCustomInput(commands)).toBe(true)
  })

  it('should return false when no placeholder', () => {
    const commands = ['give {player} diamond 1']
    expect(commandRequiresCustomInput(commands)).toBe(false)
  })

  it('should handle empty array', () => {
    expect(commandRequiresCustomInput([])).toBe(false)
  })

  it('should handle non-array', () => {
    expect(commandRequiresCustomInput(null as unknown as string[])).toBe(false)
  })
})
