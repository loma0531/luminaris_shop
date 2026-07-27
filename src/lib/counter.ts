
import prisma from '@/lib/prisma'
import { getCache } from '@/lib/cache/index'
import { RedisCacheAdapter } from '@/lib/cache/RedisCacheAdapter'
import { logger } from '@/lib/logger'

export async function getNextSequence(counterName: string): Promise<number> {
  const useRedis = process.env.REDIS_ENABLED === 'true'

  if (useRedis) {
    try {
      const cache = getCache()
      
      // ตรวจสอบว่า Cache Adapter เป็น Redis และสุขภาพปกติ
      if (cache instanceof RedisCacheAdapter && await cache.isHealthy()) {
        const client = cache.getRawClient()
        const redisKey = `sequence:${counterName}`

        // H5 Fix: ใช้ SET NX (atomic set-if-not-exists) แทนลำดับ exists → set
        // เพื่อป้องกัน TOCTOU race condition เมื่อมีหลาย requests พร้อมกัน
        const mongoCounter = await prisma.counter.findUnique({
          where: { name: counterName }
        })
        const startVal = mongoCounter ? mongoCounter.seq : 0
        // SET key value NX — ตั้งค่าเฉพาะเมื่อยังไม่มี key นี้ใน Redis (atomic)
        await client.set(redisKey, startVal.toString(), 'NX')

        // เพิ่มค่าแบบ Atomic และรับค่าถัดไป
        const nextVal = await client.incr(redisKey)

        // Sync กลับ MongoDB แบบ Async (Fire-and-Forget) เป็น Backup
        prisma.counter.upsert({
          where: { name: counterName },
          update: { seq: nextVal },
          create: { name: counterName, seq: nextVal }
        }).catch(err => {
          logger.error(`[Sequence Backup] Failed to sync ${counterName} back to MongoDB: ${err}`)
        })

        return nextVal
      }
    } catch (error) {
      logger.warn(`Redis sequence generator failed, falling back to MongoDB: ${error}`)
    }
  }

  // Fallback: ใช้ MongoDB Upsert หากปิดใช้งาน Redis หรือ Redis ขัดข้อง
  const counter = await prisma.counter.upsert({
    where: { name: counterName },
    update: {
      seq: {
        increment: 1,
      },
    },
    create: {
      name: counterName,
      seq: 1,
    },
  })

  return counter.seq
}

