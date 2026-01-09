import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { NextRequest } from 'next/server'

// Mock bcrypt with inline factory
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  }
}))

// Mock Prisma with inline factory
vi.mock('@/lib/prisma', () => ({
  default: {
    adminUser: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    }
  }
}))

// Mock Redis to bypass rate limiting
vi.mock('@/lib/redis', () => ({
  checkRateLimitRedis: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60000 }),
  getRedis: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn(),
  })),
}))

// Mock env to avoid Zod validation issues
vi.mock('@/lib/env', () => ({
  env: {
    NEXTAUTH_SECRET: 'test-secret-key',
    DATABASE_URL: 'file:./test.db',
  }
}))

// Import after mocks
import prisma from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { POST as LoginPOST } from '../login/route'
import { POST as VerifyPOST } from '../verify/route'

describe('Admin Authentication API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/admin/login', () => {
    it('should return 400 if credentials missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@admin.com' })
      })
      const res = await LoginPOST(req)
      expect(res.status).toBe(400)
    })

    it('should return 401 for invalid email', async () => {
      (prisma.adminUser.findUnique as Mock).mockResolvedValue(null)
      ;(bcrypt.compare as Mock).mockResolvedValue(false)

      const req = new NextRequest('http://localhost:3000/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ 
          email: 'wrong@admin.com', 
          password: 'pass', 
          token: 'token' 
        })
      })
      const res = await LoginPOST(req)
      expect(res.status).toBe(401)
    })

    it('should return 401 for invalid password', async () => {
      (prisma.adminUser.findUnique as Mock).mockResolvedValue({
        id: 'admin-1',
        email: 'test@admin.com',
        passwordHash: 'hash',
        tokenHash: 'hash'
      })
      ;(bcrypt.compare as Mock).mockResolvedValue(false)

      const req = new NextRequest('http://localhost:3000/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ 
          email: 'test@admin.com', 
          password: 'wrong_pass', 
          token: 'token' 
        })
      })
      const res = await LoginPOST(req)
      expect(res.status).toBe(401)
    })

    it('should return 200 and session token for valid credentials', async () => {
      (prisma.adminUser.findUnique as Mock).mockResolvedValue({
        id: 'admin-1',
        email: 'test@admin.com',
        passwordHash: 'hash',
        tokenHash: 'hash'
      })
      ;(bcrypt.compare as Mock).mockResolvedValue(true)

      const req = new NextRequest('http://localhost:3000/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ 
          email: 'test@admin.com', 
          password: 'correct_pass', 
          token: 'correct_token' 
        })
      })
      const res = await LoginPOST(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.sessionToken).toBeDefined()
    })
  })

  describe('POST /api/admin/verify', () => {
    it('should return 401 if no token provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/verify', {
        method: 'POST'
      })
      const res = await VerifyPOST(req)
      expect(res.status).toBe(401)
    })

    it('should return 401 for invalid token signature', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/verify', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid.token.format'
        }
      })
      const res = await VerifyPOST(req)
      expect(res.status).toBe(401)
    })
  })
})

