/**
 * Product Repository
 * จัดการข้อมูลสินค้าผ่าน Cache → MongoDB
 * อ่าน: Redis ก่อน → fallback MongoDB
 * เขียน: MongoDB ตรง → invalidate cache
 */

import prisma from '@/lib/prisma'
import { getCache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/index'
import { logger } from '@/lib/logger'

export class ProductRepository {
  /**
   * ดึงสินค้าทั้งหมด (ใช้ cache ก่อน)
   */
  static async getAll() {
    const cache = getCache()

    // 1. ลองอ่านจาก cache ก่อน
    try {
      const cached = await cache.get<Awaited<ReturnType<typeof this.fetchFromDB>>>(CACHE_KEYS.PRODUCTS)
      if (cached) {
        logger.debug('Products served from cache', 200)
        return cached
      }
    } catch {
      // cache error → ไม่เป็นไร ไปดึงจาก DB
    }

    // 2. ดึงจาก MongoDB
    const products = await this.fetchFromDB()

    // 3. เก็บลง cache (ไม่ block)
    cache.set(CACHE_KEYS.PRODUCTS, products, CACHE_TTL.PRODUCTS).catch(() => {})

    return products
  }

  /**
   * ดึงจาก MongoDB ตรง
   */
  private static async fetchFromDB() {
    return prisma.product.findMany({
      where: { isActive: true },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * ล้าง cache สินค้า (เรียกเมื่อ Admin แก้ไข)
   */
  static async invalidateCache(): Promise<void> {
    const cache = getCache()
    await cache.del(CACHE_KEYS.PRODUCTS)
  }
}
