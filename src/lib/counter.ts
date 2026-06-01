
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

        // ตรวจสอบว่าคีย์นี้มีใน Redis หรือยัง (Lazy initialization)
        const exists = await client.exists(redisKey)
        if (!exists) {
          const mongoCounter = await prisma.counter.findUnique({
            where: { name: counterName }
          })
          const startVal = mongoCounter ? mongoCounter.seq : 0
          // ตั้งค่าเริ่มต้นใน Redis (เช่น 0 หากเพิ่งเริ่ม)
          await client.set(redisKey, startVal.toString())
        }

        // เพิ่มค่าแบบ Atomic และรับค่าถัดไป
        const nextVal = await client.incr(redisKey)

        // ทำการซิงค์ค่ากลับไปยัง MongoDB Counter แบบ Asynchronous (Fire-and-Forget) เป็น Backup
        // วิธีนี้จะลดโหลดและไม่ดึงเวลาการรันงานหลัก (Response Time)
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

