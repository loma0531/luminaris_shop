/**
 * Tests for Unified Shop Init API
 */
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Redis - must be before other imports
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
    (prisma.category.findMany as Mock).mockResolvedValue([
      { id: 'cat-1', name: 'Test Cat', sortOrder: 0 }
    ])
    ;(prisma.product.findMany as Mock).mockResolvedValue([{ 
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
    (prisma.category.findMany as Mock).mockResolvedValue([])
    ;(prisma.product.findMany as Mock).mockResolvedValue([])

    const req = new NextRequest('http://localhost:3000/api/shop/init')
    const res = await GET(req)
    const data = await res.json()

    expect(data.cart).toBeUndefined()
  })

  it('should return cart for logged in user', async () => {
    (prisma.category.findMany as Mock).mockResolvedValue([])
    ;(prisma.product.findMany as Mock).mockResolvedValue([])
    ;(prisma.cart.findUnique as Mock).mockResolvedValue({ items: [] })
    ;(prisma.order.count as Mock).mockResolvedValue(0)

    const req = new NextRequest('http://localhost:3000/api/shop/init?minecraftName=TestUser')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.cart).toEqual([])
    expect(data.pendingOrders).toBe(0)
  })
})

