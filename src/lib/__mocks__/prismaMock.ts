/**
 * Prisma Mock for Testing
 * ใช้สำหรับ mock Prisma client ใน integration tests
 */

import { vi } from 'vitest'

// Mock cart data
export const mockCart = {
  minecraftName: 'TestPlayer',
  items: [
    { productId: '507f1f77bcf86cd799439011', quantity: 2 },
    { productId: '507f1f77bcf86cd799439022', quantity: 1 },
  ]
}

// Mock product data
export const mockProducts = [
  {
    id: '507f1f77bcf86cd799439011',
    name: 'Diamond',
    price: 100,
    image: '/uploads/products/diamond.webp',
    commands: ['give {player} diamond 1'],
    isActive: true,
    soldCount: 50,
  },
  {
    id: '507f1f77bcf86cd799439022',
    name: 'Gold Block',
    price: 50,
    image: '/uploads/products/gold.webp',
    commands: ['give {player} gold_block 1'],
    isActive: true,
    soldCount: 30,
  }
]

// Mock order data
export const mockOrder = {
  id: '507f1f77bcf86cd799439033',
  orderId: 1001,
  minecraftName: 'TestPlayer',
  total: 250,
  status: 'AWAITING_PAYMENT',
  paymentId: '507f1f77bcf86cd799439044',
  items: [
    {
      productId: '507f1f77bcf86cd799439011',
      name: 'Diamond',
      price: 100,
      quantity: 2,
      commands: ['give {player} diamond 1']
    }
  ],
  isDelivered: false,
  deliveryAttempts: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// Mock payment data
export const mockPayment = {
  id: '507f1f77bcf86cd799439044',
  paymentId: 2001,
  minecraftName: 'TestPlayer',
  amount: 250,
  status: 'PENDING',
  paymentMethod: null,
  stripeSessionId: null,
  stripePaymentIntentId: null,
  verifiedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// Mock user data
export const mockUser = {
  id: '507f1f77bcf86cd799439055',
  minecraftName: 'TestPlayer',
  lastLogin: new Date(),
  totalSpent: 500,
  createdAt: new Date(),
}

// Create mock functions
export const createMockPrismaClient = () => ({
  cart: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  product: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  order: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    groupBy: vi.fn(),
  },
  payment: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  commandQueue: {
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  $transaction: vi.fn(async (operations: unknown[]) => {
    // Execute all operations and return results
    if (Array.isArray(operations)) {
      return Promise.all(operations)
    }
    return operations
  }),
})

export type MockPrismaClient = ReturnType<typeof createMockPrismaClient>
