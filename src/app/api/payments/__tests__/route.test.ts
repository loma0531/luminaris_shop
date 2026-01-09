import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { NextRequest } from 'next/server'

// Mock auth
vi.mock('@/lib/adminAuth', () => ({
  requireAdminAuth: vi.fn(() => null),
  requireUserAuth: vi.fn(() => null),
}))

// Mock Prisma with inline factory
vi.mock('@/lib/prisma', () => ({
  default: {
    payment: {
      findMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    order: {
      deleteMany: vi.fn(),
    }
  }
}))

// Import after mocks
import prisma from '@/lib/prisma'
import { GET } from '../route'

describe('Payment Management API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/payments', () => {
    it('should return all payments', async () => {
      (prisma.payment.findMany as Mock).mockResolvedValue([
        { id: '1', paymentId: 2001, status: 'VERIFIED' },
        { id: '2', paymentId: 2002, status: 'PENDING' }
      ])
      ;(prisma.payment.count as Mock).mockResolvedValue(2)

      const req = new NextRequest('http://localhost:3000/api/payments')
      const res = await GET(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.payments).toHaveLength(2)
      expect(data.total).toBe(2)
    })
  })
})

