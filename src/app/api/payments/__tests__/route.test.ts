import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { GET } from '../route'
import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'

// Mock auth
vi.mock('@/lib/adminAuth', () => ({
  requireAdminAuth: vi.fn(() => null),
  requireUserAuth: vi.fn(() => null),
}))

// Mock Prisma
const mockPrisma = vi.hoisted(() => ({
  payment: {
    findMany: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  order: {
    deleteMany: vi.fn(),
  }
}))

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma
}))

describe('Payment Management API', () => {
  describe('GET /api/payments', () => {
    it('should return all payments', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        { id: '1', paymentId: 2001, status: 'VERIFIED' },
        { id: '2', paymentId: 2002, status: 'PENDING' }
      ])
      mockPrisma.payment.count.mockResolvedValue(2)

      const req = new NextRequest('http://localhost:3000/api/payments')
      const res = await GET(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.payments).toHaveLength(2)
      expect(data.total).toBe(2)
    })
  })
})
