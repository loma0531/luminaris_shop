/**
 * Cart Repository
 * Write-Through Cache: เขียน Redis ทันที → sync MongoDB เบื้องหลัง
 * อ่าน: Redis ก่อน → fallback MongoDB
 */

import prisma from '@/lib/prisma'
import { getCache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/index'
import { logger } from '@/lib/logger'

export interface CartItemInput {
  productId: string
  quantity: number
  customInput?: string | null
}

export interface CartWithProducts {
  items: {
    product: {
      id: string
      name: string
      price: number
      image: string | null
      commands: string[]
      requiresInput: boolean
      inputLabel: string | null
      inputPlaceholder: string | null
    }
    quantity: number
    customInput?: string | null
  }[]
  count: number
}

export class CartRepository {
  /**
   * ดึงตะกร้าของ user (อ่าน cache ก่อน → fallback MongoDB)
   */
  static async getCart(minecraftName: string): Promise<CartWithProducts | null> {
    const cache = getCache()

    // 1. ลองอ่านจาก cache
    try {
      const cached = await cache.get<CartWithProducts>(CACHE_KEYS.CART(minecraftName))
      if (cached) {
        logger.debug(`Cart served from cache for ${minecraftName}`, 200)
        return cached
      }
    } catch {
      // cache miss → ไปดึง DB
    }

    // 2. ดึงจาก MongoDB
    const result = await this.fetchFromDB(minecraftName)
    if (!result) return null

    // 3. เก็บลง cache
    cache.set(CACHE_KEYS.CART(minecraftName), result, CACHE_TTL.CART).catch(() => {})

    return result
  }

  /**
   * บันทึกตะกร้า (Write-Through: Redis ทันที + MongoDB เบื้องหลัง)
   */
  static async saveCart(minecraftName: string, items: CartItemInput[]): Promise<void> {
    const cache = getCache()

    // 1. เขียน MongoDB ทันที (ข้อมูลต้อง consistent)
    await prisma.cart.upsert({
      where: { minecraftName },
      update: { items },
      create: { minecraftName, items },
    })

    // 2. Invalidate cache เพื่อให้ครั้งถัดไปดึง fresh data
    await cache.del(CACHE_KEYS.CART(minecraftName))

    logger.cart.saved(minecraftName, items.length)
  }

  /**
   * ลบตะกร้าทั้งหมด
   */
  static async clearCart(minecraftName: string): Promise<void> {
    const cache = getCache()

    try {
      await prisma.cart.delete({ where: { minecraftName } })
    } catch {
      // ไม่มี cart ก็ไม่เป็นไร
    }

    await cache.del(CACHE_KEYS.CART(minecraftName))
  }

  /**
   * ดึงจาก MongoDB พร้อม product details
   */
  private static async fetchFromDB(minecraftName: string): Promise<CartWithProducts | null> {
    const cart = await prisma.cart.findUnique({ where: { minecraftName } })
    if (!cart || !cart.items || cart.items.length === 0) {
      return { items: [], count: 0 }
    }

    // ดึง product details
    const productIds = cart.items.map((item: { productId: string }) => item.productId)
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        price: true,
        image: true,
        commands: true,
        requiresInput: true,
        inputLabel: true,
        inputPlaceholder: true,
      },
    })

    const productMap = new Map(products.map(p => [p.id, p]))

    const items = cart.items
      .map((item: { productId: string; quantity: number; customInput?: string | null }) => {
        const product = productMap.get(item.productId)
        if (!product) return null
        return {
          product,
          quantity: item.quantity,
          customInput: item.customInput,
        }
      })
      .filter(Boolean) as CartWithProducts['items']

    const count = items.reduce((sum, item) => sum + item.quantity, 0)

    return { items, count }
  }
}
