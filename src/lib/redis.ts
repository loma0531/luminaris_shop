/**
 * Redis Compatibility Layer
 * เป็น wrapper ที่ delegate ไปที่ CacheAdapter
 * ไฟล์นี้เก็บไว้เพื่อให้โค้ดเดิมที่ import จาก '@/lib/redis' ยังใช้งานได้
 * โค้ดใหม่ควร import จาก '@/lib/cache' โดยตรง
 */

import { getCache, getRawRedisClient, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/index'
import { logger } from '@/lib/logger'

// =========================================
// Legacy: getRedis() — สำหรับโค้ดเดิมที่ยังเรียกตรง
// =========================================

export function getRedis() {
  const raw = getRawRedisClient()
  if (raw) return raw
  // ถ้าไม่มี Redis ให้ throw เพื่อให้โค้ดเดิมจัดการ error
  throw new Error('Redis is not enabled. Set REDIS_ENABLED=true in .env')
}

// =========================================
// Redis Connection Test
// =========================================

export async function testRedisConnection(): Promise<boolean> {
  const cache = getCache()
  return cache.isHealthy()
}

// =========================================
// Rate Limiting
// =========================================

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export async function checkRateLimitRedis(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  const cache = getCache()
  const now = Date.now()

  try {
    const count = await cache.incr(CACHE_KEYS.RATE_LIMIT(key), windowMs)
    const allowed = count <= maxRequests
    const remaining = Math.max(0, maxRequests - count)
    const resetAt = (Math.floor(now / windowMs) + 1) * windowMs
    return { allowed, remaining, resetAt }
  } catch {
    // Fail-open: ถ้า cache error → อนุญาต
    logger.warn('Rate limit check failed, allowing request', 200)
    return { allowed: true, remaining: maxRequests, resetAt: now + windowMs }
  }
}

// =========================================
// Token Revocation
// =========================================

export async function revokeToken(token: string): Promise<void> {
  const cache = getCache()
  await cache.set(CACHE_KEYS.TOKEN_REVOKED(token), '1', CACHE_TTL.TOKEN)
}

export async function isTokenRevoked(token: string): Promise<boolean> {
  const cache = getCache()
  const result = await cache.get<string>(CACHE_KEYS.TOKEN_REVOKED(token))
  return result !== null
}

// =========================================
// CSRF Tokens
// =========================================

export async function storeCSRFToken(sessionId: string, token: string): Promise<void> {
  const cache = getCache()
  await cache.set(CACHE_KEYS.CSRF(sessionId), token, CACHE_TTL.CSRF)
}

export async function validateCSRFToken(sessionId: string, token: string): Promise<boolean> {
  const cache = getCache()
  const storedToken = await cache.get<string>(CACHE_KEYS.CSRF(sessionId))

  if (!storedToken) return false

  // Timing-safe comparison
  if (storedToken.length !== token.length) return false
  let result = 0
  for (let i = 0; i < storedToken.length; i++) {
    result |= storedToken.charCodeAt(i) ^ token.charCodeAt(i)
  }
  return result === 0
}

export async function deleteCSRFToken(sessionId: string): Promise<void> {
  const cache = getCache()
  await cache.del(CACHE_KEYS.CSRF(sessionId))
}

// =========================================
// Data Caching (Products, Categories, Stats)
// =========================================

export async function getCachedProducts<T>(): Promise<T[] | null> {
  const cache = getCache()
  return cache.get<T[]>(CACHE_KEYS.PRODUCTS)
}

export async function setCachedProducts<T>(products: T[]): Promise<void> {
  const cache = getCache()
  await cache.set(CACHE_KEYS.PRODUCTS, products, CACHE_TTL.PRODUCTS)
}

export async function invalidateProductCache(): Promise<void> {
  const cache = getCache()
  await cache.del(CACHE_KEYS.PRODUCTS)
}

export async function getCachedCategories<T>(): Promise<T[] | null> {
  const cache = getCache()
  return cache.get<T[]>(CACHE_KEYS.CATEGORIES)
}

export async function setCachedCategories<T>(categories: T[]): Promise<void> {
  const cache = getCache()
  await cache.set(CACHE_KEYS.CATEGORIES, categories, CACHE_TTL.CATEGORIES)
}

export async function invalidateCategoryCache(): Promise<void> {
  const cache = getCache()
  await cache.del(CACHE_KEYS.CATEGORIES)
}

export async function getCachedStats<T>(): Promise<T | null> {
  const cache = getCache()
  return cache.get<T>(CACHE_KEYS.STATS)
}

export async function setCachedStats<T>(stats: T): Promise<void> {
  const cache = getCache()
  await cache.set(CACHE_KEYS.STATS, stats, CACHE_TTL.STATS)
}

// =========================================
// Cart Caching (Per-User)
// =========================================

export interface CachedCartItem {
  productId: string
  quantity: number
  customInput?: string | null
  product?: {
    id: string
    name: string
    price: number
    image: string | null
    commands: string[]
    requiresInput: boolean
    inputLabel: string | null
    inputPlaceholder: string | null
  }
}

export interface CachedCart {
  items: CachedCartItem[]
  timestamp: number
}

export async function getCachedCart(minecraftName: string): Promise<CachedCart | null> {
  const cache = getCache()
  return cache.get<CachedCart>(CACHE_KEYS.CART(minecraftName))
}

export async function setCachedCart(minecraftName: string, cart: CachedCart): Promise<void> {
  const cache = getCache()
  await cache.set(CACHE_KEYS.CART(minecraftName), cart, CACHE_TTL.CART)
}

export async function invalidateCartCache(minecraftName: string): Promise<void> {
  const cache = getCache()
  await cache.del(CACHE_KEYS.CART(minecraftName))
}

// Legacy exports ที่ไม่ได้ใช้แล้วแต่เก็บไว้กันพัง
export async function getMultipleFromCache<T>(_pattern: string): Promise<T[]> {
  return [] // ไม่รองรับใน memory mode
}

export async function pipelineOps(
  _ops: ((pipeline: unknown) => void)[]
): Promise<void> {
  // ไม่รองรับใน memory mode
}
