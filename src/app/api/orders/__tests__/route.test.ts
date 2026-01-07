import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { GET as AdminOrdersGET } from '../route'
import { GET as UserOrdersGET } from '../user/route'
import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'

// Mock admin auth
vi.mock('@/lib/adminAuth', () => ({
  requireAdminAuth: vi.fn(() => null), // Always authorised
  requireUserAuth: vi.fn(() => null), // Always authorised
  generateAdminToken: vi.fn(() => 'mock_token'),
}))

// Mock Prisma
const mockPrisma = vi.hoisted(() => ({
  order: {
    findMany: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  payment: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  }
}))

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma
}))

describe('Order Management API', () => {
  describe('GET /api/orders (Admin)', () => {
    it('should return all orders with pagination', async () => {
      mockPrisma.order.findMany.mockResolvedValue([
        { id: '1', orderId: 1001, minecraftName: 'P1', status: 'PENDING', items: [], payment: null },
        { id: '2', orderId: 1002, minecraftName: 'P2', status: 'COMPLETED', items: [], payment: null }
      ])
      mockPrisma.order.count.mockResolvedValue(2)

      const req = new NextRequest('http://localhost:3000/api/orders')
      const res = await AdminOrdersGET(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.orders).toHaveLength(2)
      expect(data.total).toBe(2)
    })
  })

  describe('GET /api/orders/user (User)', () => {
    it('should return orders for specific user', async () => {
      mockPrisma.order.findMany.mockResolvedValue([
        { id: '1', minecraftName: 'TestPlayer1', status: 'PENDING' }
      ])

      const req = new NextRequest('http://localhost:3000/api/orders/user?minecraftName=TestPlayer1&status=pending')
      const res = await UserOrdersGET(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.orders).toHaveLength(1)
    })
  })
})
