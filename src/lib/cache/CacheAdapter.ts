/**
 * Cache Adapter Interface
 * ใช้เป็น contract สำหรับ cache ทุกประเภท (Redis, Memory)
 */

export interface CacheAdapter {
  /** อ่านข้อมูลจาก cache */
  get<T>(key: string): Promise<T | null>

  /** เขียนข้อมูลลง cache พร้อม TTL (วินาที) */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>

  /** ลบข้อมูลจาก cache */
  del(key: string): Promise<void>

  /** เพิ่มค่า counter + ตั้ง TTL (มิลลิวินาที) — ใช้สำหรับ Rate Limiting */
  incr(key: string, ttlMs?: number): Promise<number>

  /** ตรวจสอบว่า cache พร้อมใช้งานหรือไม่ */
  isHealthy(): Promise<boolean>
}
