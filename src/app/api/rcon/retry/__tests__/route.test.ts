import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock auth
vi.mock('@/lib/adminAuth', () => ({
  requireAdminAuth: vi.fn(() => null),
}))

// Mock Prisma with inline factory
vi.mock('@/lib/prisma', () => ({
  default: {
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
  }
}))

// Mock RCON
vi.mock('@/lib/rcon', () => ({
  giveItemsToPlayer: vi.fn(),
}))

// Import after mocks
import prisma from '@/lib/prisma'
import { giveItemsToPlayer } from '@/lib/rcon'
import { POST } from '../route'

describe('RCON Retry API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should retry failed commands', async () => {
    vi.mocked(prisma.commandQueue.findMany).mockResolvedValue([
      {
        id: 'cmd-1',
        orderId: 'order-1',
        minecraftName: 'TestPlayer',
        command: 'give item 1',
        status: 'FAILED',
        retryCount: 0
      } as never
    ])

    vi.mocked(giveItemsToPlayer).mockResolvedValue({ success: true, results: ['Done'] })
    vi.mocked(prisma.commandQueue.count).mockResolvedValue(0)

    const req = new NextRequest('http://localhost:3000/api/rcon/retry', { method: 'POST' })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.processed).toBe(1)
    expect(data.results[0].status).toBe('COMPLETED')
    
    expect(prisma.commandQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cmd-1' },
        data: { status: 'COMPLETED' }
      })
    )
  })
})
