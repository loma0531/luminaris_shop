/**
 * Redis Client
 * ใช้สำหรับ Rate Limiting, Token Revocation, และ Caching
 */
import Redis from 'ioredis'
import { logger } from '@/lib/logger'

let redis: Redis | null = null

function getRedisUrl(): string {
  const url = process.env.REDIS_URL
  if (!url) {
    throw new Error('REDIS_URL is not configured')
  }
  return url
}

/**
 * Get Redis client singleton
 */
export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000)
        return delay
      },
      enableReadyCheck: true,
      reconnectOnError(err) {
        // Reconnect on various connection errors
        const reconnectErrors = [
          'READONLY',      // Redis failover
          'ECONNRESET',    // Connection reset
          'ETIMEDOUT',     // Timeout
          'ECONNREFUSED',  // Connection refused
          'EPIPE',         // Broken pipe
        ]
        
        for (const errorType of reconnectErrors) {
          if (err.message.includes(errorType)) {
            return true
          }
        }
        return false
      },
    })

    redis.on('error', (err) => {
      logger.redis.error(err.message)
    })

    redis.on('connect', () => {
      logger.redis.connected()
    })
  }
  return redis
}

/**
 * Test Redis connection
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const client = getRedis()
    await client.ping()
    return true
  } catch {
    return false
  }
}

// =========================================
// Rate Limiting
// =========================================

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * Check rate limit using Redis
 */
export async function checkRateLimitRedis(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  const client = getRedis()
  const now = Date.now()
  const windowKey = `ratelimit:${key}:${Math.floor(now / windowMs)}`

  try {
    const multi = client.multi()
    multi.incr(windowKey)
    multi.pexpire(windowKey, windowMs)
    const results = await multi.exec()

    const count = (results?.[0]?.[1] as number) || 1
    const allowed = count <= maxRequests
    const remaining = Math.max(0, maxRequests - count)
    const resetAt = (Math.floor(now / windowMs) + 1) * windowMs

    return { allowed, remaining, resetAt }
  } catch (error) {
    // Fallback: allow on Redis error (fail-open for availability)
    logger.redis.error(`Rate limit check failed: ${error}`)
    return { allowed: true, remaining: maxRequests, resetAt: now + windowMs }
  }
}

// =========================================
// Token Revocation
// =========================================

const TOKEN_BLACKLIST_PREFIX = 'token:revoked:'
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days (match token expiry)

/**
 * Revoke a token
 */
export async function revokeToken(token: string): Promise<void> {
  const client = getRedis()
  const key = `${TOKEN_BLACKLIST_PREFIX}${token}`
  await client.setex(key, TOKEN_TTL_SECONDS, '1')
}

/**
 * Check if a token is revoked
 */
export async function isTokenRevoked(token: string): Promise<boolean> {
  const client = getRedis()
  const key = `${TOKEN_BLACKLIST_PREFIX}${token}`
  const result = await client.get(key)
  return result !== null
}

// =========================================
// CSRF Tokens
// =========================================

const CSRF_PREFIX = 'csrf:'
const CSRF_TTL_SECONDS = 60 * 60 // 1 hour

/**
 * Store CSRF token
 */
export async function storeCSRFToken(sessionId: string, token: string): Promise<void> {
  const client = getRedis()
  const key = `${CSRF_PREFIX}${sessionId}`
  await client.setex(key, CSRF_TTL_SECONDS, token)
}

/**
 * Validate CSRF token
 */
export async function validateCSRFToken(sessionId: string, token: string): Promise<boolean> {
  const client = getRedis()
  const key = `${CSRF_PREFIX}${sessionId}`
  const storedToken = await client.get(key)
  
  if (!storedToken) return false
  
  // Use timing-safe comparison
  if (storedToken.length !== token.length) return false
  let result = 0
  for (let i = 0; i < storedToken.length; i++) {
    result |= storedToken.charCodeAt(i) ^ token.charCodeAt(i)
  }
  return result === 0
}

/**
 * Delete CSRF token (after use)
 */
export async function deleteCSRFToken(sessionId: string): Promise<void> {
  const client = getRedis()
  const key = `${CSRF_PREFIX}${sessionId}`
  await client.del(key)
}

// =========================================
// Data Caching (Products, Categories, Stats)
// =========================================

const CACHE_PREFIX = {
  PRODUCTS: 'cache:products',
  CATEGORIES: 'cache:categories',
  STATS: 'cache:stats',
}

const CACHE_TTL = {
  PRODUCTS: 300,     // 5 minutes (SWR จะ revalidate ฝั่ง client ทุก 30s อยู่แล้ว)
  CATEGORIES: 600,   // 10 minutes (categories แทบไม่เปลี่ยน)
  STATS: 120,        // 2 minutes
}

/**
 * Get cached products
 */
export async function getCachedProducts<T>(): Promise<T[] | null> {
  try {
    const client = getRedis()
    const data = await client.get(CACHE_PREFIX.PRODUCTS)
    if (data) {
      return JSON.parse(data) as T[]
    }
    return null
  } catch {
    return null
  }
}

/**
 * Get multiple keys from cache pattern
 */
export async function getMultipleFromCache<T>(pattern: string): Promise<T[]> {
  const client = getRedis()
  try {
    const keys = await client.keys(pattern)
    if (keys.length === 0) return []
    
    const validKeys = keys.slice(0, 100) // Limit to avoid blocking
    if (validKeys.length === 0) return []

    const values = await client.mget(validKeys)
    return values
      .filter((v): v is string => v !== null)
      .map(v => JSON.parse(v)) as T[]
  } catch (error) {
    logger.redis.error(`Multi-get failed: ${error}`)
    return []
  }
}

/**
 * Pipeline cache operations for max speed
 */
export async function pipelineOps(
  ops: ((pipeline: Redis) => void)[]
): Promise<void> {
  const client = getRedis()
  try {
    const pipeline = client.pipeline()
    ops.forEach(op => op(pipeline as unknown as Redis))
    await pipeline.exec()
  } catch (error) {
    logger.redis.error(`Pipeline failed: ${error}`)
  }
}

/**
 * Set cached products
 */
export async function setCachedProducts<T>(products: T[]): Promise<void> {
  try {
    const client = getRedis()
    await client.setex(CACHE_PREFIX.PRODUCTS, CACHE_TTL.PRODUCTS, JSON.stringify(products))
  } catch {
    // Ignore cache errors
  }
}

/**
 * Invalidate products cache
 */
export async function invalidateProductCache(): Promise<void> {
  try {
    const client = getRedis()
    await client.del(CACHE_PREFIX.PRODUCTS)
  } catch {
    // Ignore
  }
}

/**
 * Get cached categories
 */
export async function getCachedCategories<T>(): Promise<T[] | null> {
  try {
    const client = getRedis()
    const data = await client.get(CACHE_PREFIX.CATEGORIES)
    if (data) {
      return JSON.parse(data) as T[]
    }
    return null
  } catch {
    return null
  }
}

/**
 * Set cached categories
 */
export async function setCachedCategories<T>(categories: T[]): Promise<void> {
  try {
    const client = getRedis()
    await client.setex(CACHE_PREFIX.CATEGORIES, CACHE_TTL.CATEGORIES, JSON.stringify(categories))
  } catch {
    // Ignore cache errors
  }
}

/**
 * Invalidate categories cache
 */
export async function invalidateCategoryCache(): Promise<void> {
  try {
    const client = getRedis()
    await client.del(CACHE_PREFIX.CATEGORIES)
  } catch {
    // Ignore
  }
}

/**
 * Get cached stats
 */
export async function getCachedStats<T>(): Promise<T | null> {
  try {
    const client = getRedis()
    const data = await client.get(CACHE_PREFIX.STATS)
    if (data) {
      return JSON.parse(data) as T
    }
    return null
  } catch {
    return null
  }
}

/**
 * Set cached stats
 */
export async function setCachedStats<T>(stats: T): Promise<void> {
  try {
    const client = getRedis()
    await client.setex(CACHE_PREFIX.STATS, CACHE_TTL.STATS, JSON.stringify(stats))
  } catch {
    // Ignore cache errors
  }
}

// =========================================
// Cart Caching (Per-User)
// =========================================

const CART_CACHE_PREFIX = 'cache:cart:'
const CART_CACHE_TTL = 60 // 60 seconds - SWR handles client-side freshness

export interface CachedCartItem {
  productId: string // Keeping for reference
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

/**
 * Get cached cart for a user
 */
export async function getCachedCart(minecraftName: string): Promise<CachedCart | null> {
  try {
    const client = getRedis()
    const key = `${CART_CACHE_PREFIX}${minecraftName}`
    const data = await client.get(key)
    if (data) {
      return JSON.parse(data) as CachedCart
    }
    return null
  } catch {
    return null
  }
}

/**
 * Set cached cart for a user
 */
export async function setCachedCart(minecraftName: string, cart: CachedCart): Promise<void> {
  try {
    const client = getRedis()
    const key = `${CART_CACHE_PREFIX}${minecraftName}`
    await client.setex(key, CART_CACHE_TTL, JSON.stringify(cart))
  } catch {
    // Ignore cache errors
  }
}

/**
 * Invalidate cart cache for a user
 */
export async function invalidateCartCache(minecraftName: string): Promise<void> {
  try {
    const client = getRedis()
    const key = `${CART_CACHE_PREFIX}${minecraftName}`
    await client.del(key)
  } catch {
    // Ignore
  }
}
