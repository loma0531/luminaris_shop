import { describe, it, expect, vi } from 'vitest'

// Mock env module to avoid zod import issues during testing
vi.mock('@/lib/env', () => ({
  env: {
    NEXTAUTH_SECRET: 'test-secret-for-vitest',
  }
}))

import {
  generateAdminToken,
  verifyAdminToken,
  generateShopToken,
  verifyShopToken
} from './adminAuth'

describe('adminAuth', () => {
  describe('Admin Token', () => {
    describe('generateAdminToken', () => {
      it('generates a valid token format (payload.signature)', () => {
        const token = generateAdminToken()
        expect(token).toContain('.')
        const parts = token.split('.')
        expect(parts.length).toBe(2)
      })

      it('generates unique tokens', () => {
        const token1 = generateAdminToken()
        const token2 = generateAdminToken()
        expect(token1).not.toBe(token2)
      })
    })

    describe('verifyAdminToken', () => {
      it('validates a correctly generated token', () => {
        const token = generateAdminToken()
        const result = verifyAdminToken(token)
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      })

      it('rejects empty token', () => {
        const result = verifyAdminToken('')
        expect(result.valid).toBe(false)
        expect(result.error).toBe('No token provided')
      })

      it('rejects token with wrong format', () => {
        const result = verifyAdminToken('invalid-token')
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Invalid token format')
      })

      it('rejects token with invalid signature', () => {
        const token = generateAdminToken()
        const [payload] = token.split('.')
        const fakeToken = `${payload}.invalidsignature`
        
        const result = verifyAdminToken(fakeToken)
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Invalid token signature')
      })

      it('rejects token with tampered payload', () => {
        const token = generateAdminToken()
        const [, signature] = token.split('.')
        const tamperedPayload = Buffer.from(JSON.stringify({ type: 'hacked' })).toString('base64')
        const fakeToken = `${tamperedPayload}.${signature}`
        
        const result = verifyAdminToken(fakeToken)
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Invalid token signature')
      })
    })
  })

  describe('Shop Token', () => {
    describe('generateShopToken', () => {
      it('generates a valid token format', () => {
        const token = generateShopToken('TestPlayer')
        expect(token).toContain('.')
        const parts = token.split('.')
        expect(parts.length).toBe(2)
      })

      it('generates unique tokens', () => {
        const token1 = generateShopToken('Player1')
        const token2 = generateShopToken('Player1')
        expect(token1).not.toBe(token2)
      })
    })

    describe('verifyShopToken', () => {
      it('validates a correctly generated token', () => {
        const token = generateShopToken('TestPlayer')
        const result = verifyShopToken(token)
        expect(result.valid).toBe(true)
      })

      it('validates token with matching minecraftName', () => {
        const token = generateShopToken('TestPlayer')
        const result = verifyShopToken(token, 'TestPlayer')
        expect(result.valid).toBe(true)
      })

      it('validates token case-insensitively', () => {
        const token = generateShopToken('TestPlayer')
        const result = verifyShopToken(token, 'testplayer')
        expect(result.valid).toBe(true)
      })

      it('rejects token with mismatched minecraftName', () => {
        const token = generateShopToken('Player1')
        const result = verifyShopToken(token, 'Player2')
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Token name mismatch')
      })

      it('rejects null token', () => {
        const result = verifyShopToken(null)
        expect(result.valid).toBe(false)
        expect(result.error).toBe('No token provided')
      })

      it('rejects token with invalid format', () => {
        const result = verifyShopToken('invalid-token')
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Invalid token format')
      })

      it('rejects token with invalid signature', () => {
        const token = generateShopToken('TestPlayer')
        const [payload] = token.split('.')
        const fakeToken = `${payload}.invalidsignature`
        
        const result = verifyShopToken(fakeToken)
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Invalid token signature')
      })
    })
  })
})
