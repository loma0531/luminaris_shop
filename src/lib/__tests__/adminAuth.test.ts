import { describe, expect, it, vi } from 'vitest'

// Mock env before importing adminAuth
vi.mock('@/lib/env', () => ({
  env: {
    NEXTAUTH_SECRET: 'test-secret-key-for-testing-purposes',
    DATABASE_URL: 'file:./test.db',
  }
}))

import { 
  generateAdminToken, 
  verifyAdminToken, 
  generateShopToken,
  verifyShopToken 
} from '../adminAuth'

describe('Admin Authentication Logic', () => {
  it('should generate a valid admin token', () => {
    const token = generateAdminToken()
    expect(token).toBeDefined()
    expect(typeof token).toBe('string')
    expect(token.split('.').length).toBe(2)
  })

  it('should verify a valid admin token', async () => {
    const token = generateAdminToken()
    const result = await verifyAdminToken(token)
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should REJECT a shop token when verifying as admin', async () => {
    // This reproduces the "Invalid token type" error
    const shopToken = await generateShopToken('testUser')
    const result = await verifyAdminToken(shopToken)
    
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid token type')
    expect(result.error).toContain('shop') // Should show what type it got
  })

  it('should REJECT a manipulated/fake token', () => {
    const token = generateAdminToken()
    const [payload] = token.split('.')
    const fakeToken = `${payload}.fakesignature`
    
    const result = await verifyAdminToken(fakeToken)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid token signature')
  })

  it('should correctly handle shop tokens', () => {
    const token = generateShopToken('Loma0531')
    const result = verifyShopToken(token, 'Loma0531')
    expect(result.valid).toBe(true)
  })

  it('should reject shop token with wrong username', () => {
    const token = generateShopToken('Loma0531')
    const result = verifyShopToken(token, 'OtherUser')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Token name mismatch')
  })
})
