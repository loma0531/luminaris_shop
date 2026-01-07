import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { POST } from '../route'
import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { giveItemsToPlayer } from '@/lib/rcon'

// Mock auth
vi.mock('@/lib/adminAuth', () => ({
  requireAdminAuth: vi.fn(() => null),
}))

// Mock Prisma
const mockPrisma = vi.hoisted(() => ({
  commandQueue: {
    findMany: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  order: {
    update: vi.fn(),
  }
}))

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma
}))

// Mock RCON
vi.mock('@/lib/rcon', () => ({
  giveItemsToPlayer: vi.fn(),
}))

describe('RCON Retry API', () => {
  it('should retry failed commands', async () => {
    // Mock fetch pending commands
    mockPrisma.commandQueue.findMany.mockResolvedValue([
       {
        id: 'cmd-1',
        orderId: 'order-1',
        minecraftName: 'TestPlayer',
        command: 'give item 1',
        status: 'FAILED',
        retryCount: 0
      }
    ])

    // Mock success RCON
    vi.mocked(giveItemsToPlayer).mockResolvedValue({ success: true, results: ['Done'] })
    
    // Mock count for sync
    mockPrisma.commandQueue.count.mockResolvedValue(0)

    const req = new NextRequest('http://localhost:3000/api/rcon/retry', { method: 'POST' })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.processed).toBe(1)
    expect(data.results[0].status).toBe('COMPLETED')
    
    // Check if updated to COMPLETED
    expect(mockPrisma.commandQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cmd-1' },
        data: { status: 'COMPLETED' }
      })
    )
  })
})
