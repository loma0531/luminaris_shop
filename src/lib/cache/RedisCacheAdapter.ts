/**
 * Redis Cache Adapter
 * Wrap ioredis ให้อยู่ภายใต้ CacheAdapter interface
 */

import Redis from 'ioredis'
import type { CacheAdapter } from './CacheAdapter'
import { logger } from '@/lib/logger'

let redis: Redis | null = null

function getRedisInstance(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL
    if (!url) {
      throw new Error('REDIS_URL is not configured')
    }

    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000)
        return delay
      },
      enableReadyCheck: true,
      reconnectOnError(err) {
        const reconnectErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE']
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

export class RedisCacheAdapter implements CacheAdapter {
  async get<T>(key: string): Promise<T | null> {
    try {
      const client = getRedisInstance()
      const data = await client.get(key)
      if (data) {
        return JSON.parse(data) as T
      }
      return null
    } catch {
      return null
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const client = getRedisInstance()
      const json = JSON.stringify(value)
      if (ttlSeconds) {
        await client.setex(key, ttlSeconds, json)
      } else {
        await client.set(key, json)
      }
    } catch {
      // ไม่ให้ cache error ทำให้ระบบหลักพัง
    }
  }

  async del(key: string): Promise<void> {
    try {
      const client = getRedisInstance()
      await client.del(key)
    } catch {
      // ignore
    }
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    try {
      const client = getRedisInstance()
      const windowKey = `${key}:${Math.floor(Date.now() / (ttlMs || 60000))}`
      const multi = client.multi()
      multi.incr(windowKey)
      if (ttlMs) {
        multi.pexpire(windowKey, ttlMs)
      }
      const results = await multi.exec()
      return (results?.[0]?.[1] as number) || 1
    } catch {
      return 1 // fail-open
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const client = getRedisInstance()
      await client.ping()
      return true
    } catch {
      return false
    }
  }

  /** เข้าถึง Redis client ตรงๆ (สำหรับกรณีพิเศษ เช่น CSRF tokens) */
  getRawClient(): Redis {
    return getRedisInstance()
  }
}
