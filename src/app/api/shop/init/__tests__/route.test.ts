/**
 * Tests for Unified Shop Init API
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { GET } from '../route'
import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'

// Mock Redis
vi.mock('@/lib/redis', () => ({
  getRedis: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn(),
  })),
  getCachedProducts: vi.fn().mockResolvedValue(null),
  setCachedProducts: vi.fn(),
  getCachedCategories: vi.fn().mockResolvedValue(null),
  setCachedCategories: vi.fn(),
}))

// Mock Prisma
const mockPrisma = vi.hoisted(() => ({
  category: {
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  product: {
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  cart: {
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
  },
  order: {
    count: vi.fn(),
  }
}))

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma
}))

// Mock adminAuth
vi.mock('@/lib/adminAuth', () => ({
  requireUserAuth: vi.fn(),
  extractTokenFromRequest: vi.fn(),
  verifyShopToken: vi.fn(() => ({ valid: true }))
}))

describe('Unified Shop Init API', () => {
  it('should return products and categories in one call', async () => {
    // Mock data
    mockPrisma.category.findMany.mockResolvedValue([{ id: 'cat-1', name: 'Test Cat', sortOrder: 0 }])
    mockPrisma.product.findMany.mockResolvedValue([{ 
      id: 'prod-1', 
      name: 'Test Product', 
      price: 100, 
      categoryId: 'cat-1',
      isActive: true 
    }])

    const req = new NextRequest('http://localhost:3000/api/shop/init')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.products).toHaveLength(1)
    expect(data.categories).toHaveLength(1)
    expect(data.timestamp).toBeDefined()
  })

  it('should return empty cart for guest', async () => {
    const req = new NextRequest('http://localhost:3000/api/shop/init')
    const res = await GET(req)
    const data = await res.json()

    expect(data.cart).toBeUndefined()
  })

  it('should return cart for logged in user', async () => {
    // Mock cart
    mockPrisma.cart.findUnique.mockResolvedValue({ items: [] })
    mockPrisma.order.count.mockResolvedValue(0)

    const req = new NextRequest('http://localhost:3000/api/shop/init?minecraftName=TestUser')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.cart).toEqual([])
    expect(data.pendingOrders).toBe(0)
  })
})
