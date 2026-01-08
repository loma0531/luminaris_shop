/**
 * Tests for Unified Shop Init API
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Prisma with inline factory
vi.mock('@/lib/prisma', () => ({
  default: {
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
  }
}))

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

// Mock adminAuth
vi.mock('@/lib/adminAuth', () => ({
  requireUserAuth: vi.fn(),
  extractTokenFromRequest: vi.fn(),
  verifyShopToken: vi.fn(() => ({ valid: true }))
}))

// Import after mocks
import prisma from '@/lib/prisma'
import { GET } from '../route'

describe('Unified Shop Init API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return products and categories in one call', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      { id: 'cat-1', name: 'Test Cat', sortOrder: 0 } as never
    ])
    vi.mocked(prisma.product.findMany).mockResolvedValue([{ 
      id: 'prod-1', 
      name: 'Test Product', 
      price: 100, 
      categoryId: 'cat-1',
      isActive: true 
    } as never])

    const req = new NextRequest('http://localhost:3000/api/shop/init')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.products).toHaveLength(1)
    expect(data.categories).toHaveLength(1)
    expect(data.timestamp).toBeDefined()
  })

  it('should return empty cart for guest', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue([])
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    const req = new NextRequest('http://localhost:3000/api/shop/init')
    const res = await GET(req)
    const data = await res.json()

    expect(data.cart).toBeUndefined()
  })

  it('should return cart for logged in user', async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue([])
    vi.mocked(prisma.product.findMany).mockResolvedValue([])
    vi.mocked(prisma.cart.findUnique).mockResolvedValue({ items: [] } as never)
    vi.mocked(prisma.order.count).mockResolvedValue(0)

    const req = new NextRequest('http://localhost:3000/api/shop/init?minecraftName=TestUser')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.cart).toEqual([])
    expect(data.pendingOrders).toBe(0)
  })
})
