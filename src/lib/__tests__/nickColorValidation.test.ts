import { describe, it, expect } from 'vitest'
import {
  validateNickColorCode,
  sanitizeNickColorCode,
  replaceCustomInputInCommand,
  commandRequiresCustomInput,
} from '../nickColorValidation'

describe('validateNickColorCode', () => {
  it('should accept valid simple color codes', () => {
    const result = validateNickColorCode('&aTest')
    expect(result.valid).toBe(true)
  })

  it('should accept valid hex color codes', () => {
    const result = validateNickColorCode('&x&F&F&0&0&0&0Test')
    expect(result.valid).toBe(true)
  })

  it('should accept complex gradient codes', () => {
    const code = '&x&8&6&6&4&F&FL&x&9&6&7&3&F&Fo&x&A&5&8&3&F&Em'
    const result = validateNickColorCode(code)
    expect(result.valid).toBe(true)
  })

  it('should reject empty input', () => {
    expect(validateNickColorCode('')).toEqual({ valid: false, error: 'กรุณากรอกโค้ดสี' })
    expect(validateNickColorCode('   ')).toEqual({ valid: false, error: 'กรุณากรอกโค้ดสี' })
  })

  it('should reject null/undefined', () => {
    expect(validateNickColorCode(null as unknown as string).valid).toBe(false)
    expect(validateNickColorCode(undefined as unknown as string).valid).toBe(false)
  })

  it('should reject code without color markers', () => {
    const result = validateNickColorCode('JustText')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('&')
  })

  it('should reject dangerous patterns - semicolon', () => {
    const result = validateNickColorCode('&aTest;/op hacker')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('ไม่อนุญาต')
  })

  it('should reject dangerous patterns - newline', () => {
    const result = validateNickColorCode('&aTest\n/op hacker')
    expect(result.valid).toBe(false)
  })

  it('should reject dangerous patterns - slash', () => {
    const result = validateNickColorCode('&aTest/op hacker')
    expect(result.valid).toBe(false)
  })

  it('should reject dangerous patterns - brackets', () => {
    const result = validateNickColorCode('&a{player}')
    expect(result.valid).toBe(false)
  })

  it('should reject too long input', () => {
    const longCode = '&a' + 'A'.repeat(250)
    const result = validateNickColorCode(longCode)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('ยาวเกินไป')
  })
})

describe('sanitizeNickColorCode', () => {
  it('should trim whitespace', () => {
    expect(sanitizeNickColorCode('  &aTest  ')).toBe('&aTest')
  })

  it('should remove dangerous characters', () => {
    expect(sanitizeNickColorCode('&aTest;/op')).toBe('&aTestop')
  })

  it('should handle null/undefined', () => {
    expect(sanitizeNickColorCode(null as unknown as string)).toBe('')
    expect(sanitizeNickColorCode(undefined as unknown as string)).toBe('')
  })

  it('should truncate long input', () => {
    const longCode = '&a' + 'A'.repeat(250)
    const result = sanitizeNickColorCode(longCode)
    expect(result.length).toBeLessThanOrEqual(200)
  })
})

describe('replaceCustomInputInCommand', () => {
  it('should replace {customInput} with value', () => {
    const cmd = 'cmi nick {player} {customInput}'
    const result = replaceCustomInputInCommand(cmd, '&aTest')
    expect(result).toBe('cmi nick {player} &aTest')
  })

  it('should handle case insensitive placeholder', () => {
    const cmd = 'cmi nick {player} {CUSTOMINPUT}'
    const result = replaceCustomInputInCommand(cmd, '&aTest')
    expect(result).toBe('cmi nick {player} &aTest')
  })

  it('should sanitize input before replacement', () => {
    const cmd = 'cmi nick {player} {customInput}'
    const result = replaceCustomInputInCommand(cmd, '&aTest;/op')
    expect(result).toBe('cmi nick {player} &aTestop')
    expect(result).not.toContain(';')
  })

  it('should handle null command', () => {
    expect(replaceCustomInputInCommand(null as unknown as string, '&aTest')).toBe(null)
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
