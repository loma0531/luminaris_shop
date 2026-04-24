/**
 * In-Memory Cache Adapter
 * ใช้เมื่อ Redis ไม่พร้อมใช้งาน หรือ REDIS_ENABLED=false
 * ข้อมูลจะหายเมื่อ restart server
 */

import type { CacheAdapter } from './CacheAdapter'

interface CacheEntry<T = unknown> {
  value: T
  expiresAt: number | null // null = ไม่หมดอายุ
}

export class MemoryCacheAdapter implements CacheAdapter {
  private store = new Map<string, CacheEntry>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    // ทำ cleanup ทุก 60 วินาที เพื่อไม่ให้ memory รั่ว
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000)
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key)
    if (!entry) return null

    // เช็คว่า entry หมดอายุหรือยัง
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }

    return entry.value as T
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
    this.store.set(key, { value, expiresAt })
  }

  async del(key: string): Promise<void> {
    this.store.delete(key)
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    const entry = this.store.get(key)
    let count = 1

    if (entry && (entry.expiresAt === null || Date.now() <= entry.expiresAt)) {
      count = (entry.value as number) + 1
    }

    const expiresAt = ttlMs ? Date.now() + ttlMs : entry?.expiresAt ?? null
    this.store.set(key, { value: count, expiresAt })
    return count
  }

  async isHealthy(): Promise<boolean> {
    return true // Memory เสมอพร้อม
  }

  /** ลบ entries ที่หมดอายุ */
  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.store.delete(key)
      }
    }
  }

  /** ปิด cleanup interval (สำหรับ testing) */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}
