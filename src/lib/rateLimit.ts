/**
 * Rate Limiter Utility
 * ใช้ CacheAdapter (Redis/Memory) เพื่อควบคุมจำนวน Request
 * (ใช้สำหรับ Node.js API Routes ไม่ใช่ Edge Middleware)
 */

import { getCache } from '@/lib/cache/index'

interface RateLimitConfig {
  limit: number
  windowMs: number
}

export async function rateLimit(identifier: string, config: RateLimitConfig): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const cache = getCache()
  const key = `ratelimit:${identifier}`
  
  // ใช้ atomic increment
  const current = await cache.incr(key, config.windowMs)
  
  return {
    success: current <= config.limit,
    limit: config.limit,
    remaining: Math.max(0, config.limit - current),
    reset: Date.now() + config.windowMs,
  }
}
