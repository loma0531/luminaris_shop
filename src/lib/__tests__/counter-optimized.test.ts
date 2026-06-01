import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { getNextSequence } from '../counter'

// Mock prisma client
vi.mock('@/lib/prisma', () => ({
  default: {
    counter: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    }
  }
}))

// Mock cache index
const mockRedisClient = {
  exists: vi.fn(),
  set: vi.fn(),
  incr: vi.fn(),
}

const mockRedisAdapter = {
  isHealthy: vi.fn(),
  getRawClient: vi.fn(() => mockRedisClient),
}

vi.mock('@/lib/cache/index', () => ({
  getCache: vi.fn(() => mockRedisAdapter)
}))

// Mock RedisCacheAdapter representation
vi.mock('@/lib/cache/RedisCacheAdapter', () => {
  return {
    RedisCacheAdapter: class {}
  }
})

import prisma from '@/lib/prisma'
import { getCache } from '@/lib/cache/index'
import { RedisCacheAdapter } from '@/lib/cache/RedisCacheAdapter'

describe('Optimized Sequence Generator (getNextSequence)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REDIS_ENABLED = 'false'
    
    // ตั้งค่า prototype ให้ cache หลอกๆ ของเราถูกตรวจจับว่าเป็น instance ของ RedisCacheAdapter
    Object.setPrototypeOf(mockRedisAdapter, RedisCacheAdapter.prototype)
  })

  it('ควรใช้ MongoDB upsert เป็น fallback หากไม่ได้เปิดใช้งาน Redis', async () => {
    process.env.REDIS_ENABLED = 'false'
    ;(prisma.counter.upsert as Mock).mockResolvedValue({ seq: 42 })

    const result = await getNextSequence('order_id')
    
    expect(result).toBe(42)
    expect(prisma.counter.upsert).toHaveBeenCalledWith({
      where: { name: 'order_id' },
      update: { seq: { increment: 1 } },
      create: { name: 'order_id', seq: 1 },
    })
    expect(mockRedisClient.incr).not.toHaveBeenCalled()
  })

  it('ควรใช้ Redis INCR เมื่อเปิดใช้งาน Redis และสถานะของเซิร์ฟเวอร์ Redis ปกติ', async () => {
    process.env.REDIS_ENABLED = 'true'
    mockRedisAdapter.isHealthy.mockResolvedValue(true)
    mockRedisClient.exists.mockResolvedValue(true) // สมมติว่ามีค่าตั้งต้นแล้ว
    mockRedisClient.incr.mockResolvedValue(101)
    ;(prisma.counter.upsert as Mock).mockResolvedValue({ seq: 101 }) // สำหรับ backup async

    const result = await getNextSequence('payment_id')

    expect(result).toBe(101)
    expect(mockRedisClient.incr).toHaveBeenCalledWith('sequence:payment_id')
  })

  it('ควรทำ Lazy Initialization โดยดึงค่าจาก MongoDB มาก่อนหากยังไม่มีคีย์ใน Redis', async () => {
    process.env.REDIS_ENABLED = 'true'
    mockRedisAdapter.isHealthy.mockResolvedValue(true)
    mockRedisClient.exists.mockResolvedValue(false) // ยังไม่มีคีย์ใน Redis
    
    // จำลองดึงค่าเริ่มต้นจาก MongoDB ได้ 500
    ;(prisma.counter.findUnique as Mock).mockResolvedValue({ seq: 500 })
    mockRedisClient.incr.mockResolvedValue(501)
    ;(prisma.counter.upsert as Mock).mockResolvedValue({ seq: 501 }) // สำหรับ backup async

    const result = await getNextSequence('order_id')

    expect(result).toBe(501)
    expect(prisma.counter.findUnique).toHaveBeenCalledWith({
      where: { name: 'order_id' }
    })
    expect(mockRedisClient.set).toHaveBeenCalledWith('sequence:order_id', '500')
    expect(mockRedisClient.incr).toHaveBeenCalledWith('sequence:order_id')
  })

  it('ควร Fallback ไปยัง MongoDB อัตโนมัติหาก Redis ดับหรือมีข้อผิดพลาดเกิดขึ้น', async () => {
    process.env.REDIS_ENABLED = 'true'
    mockRedisAdapter.isHealthy.mockResolvedValue(false) // Redis สุขภาพไม่ดี
    ;(prisma.counter.upsert as Mock).mockResolvedValue({ seq: 99 })

    const result = await getNextSequence('order_id')

    expect(result).toBe(99)
    expect(prisma.counter.upsert).toHaveBeenCalled()
    expect(mockRedisClient.incr).not.toHaveBeenCalled()
  })
})
