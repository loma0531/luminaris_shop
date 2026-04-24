/**
 * Cache Factory
 * เลือก Cache Adapter ตาม ENV: REDIS_ENABLED
 * 
 * ถ้า REDIS_ENABLED=true → ใช้ Redis
 * ถ้า REDIS_ENABLED=false หรือไม่ได้ตั้งค่า → ใช้ In-Memory
 */

import type { CacheAdapter } from './CacheAdapter'
import { RedisCacheAdapter } from './RedisCacheAdapter'
import { MemoryCacheAdapter } from './MemoryCacheAdapter'

let cacheInstance: CacheAdapter | null = null

/**
 * ดึง Cache Adapter (Singleton)
 * จะสร้างครั้งเดียวแล้วใช้ซ้ำตลอดอายุของ process
 */
export function getCache(): CacheAdapter {
  if (!cacheInstance) {
    const useRedis = process.env.REDIS_ENABLED === 'true'

    if (useRedis) {
      cacheInstance = new RedisCacheAdapter()
    } else {
      cacheInstance = new MemoryCacheAdapter()
    }
  }
  return cacheInstance
}

/**
 * ดึง Redis client ตรงๆ (สำหรับ operations ที่ต้องใช้ Redis เฉพาะ เช่น CSRF)
 * ถ้าไม่ได้เปิด Redis จะ fallback ไป memory
 */
export function getRawRedisClient() {
  const cache = getCache()
  if (cache instanceof RedisCacheAdapter) {
    return cache.getRawClient()
  }
  return null
}

// Re-export types
export type { CacheAdapter } from './CacheAdapter'

// =============================================
// Cache Key Constants (เก็บไว้ที่เดียว)
// =============================================

export const CACHE_KEYS = {
  PRODUCTS: 'cache:products',
  CATEGORIES: 'cache:categories',
  STATS: 'cache:stats',
  CART: (name: string) => `cache:cart:${name}`,
  RATE_LIMIT: (key: string) => `ratelimit:${key}`,
  TOKEN_REVOKED: (token: string) => `token:revoked:${token}`,
  CSRF: (sessionId: string) => `csrf:${sessionId}`,
} as const

export const CACHE_TTL = {
  PRODUCTS: 300,     // 5 นาที
  CATEGORIES: 600,   // 10 นาที
  STATS: 120,        // 2 นาที
  CART: 60,          // 1 นาที
  TOKEN: 7 * 24 * 60 * 60, // 7 วัน
  CSRF: 60 * 60,     // 1 ชั่วโมง
} as const
