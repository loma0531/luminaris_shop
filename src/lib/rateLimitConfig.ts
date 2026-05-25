/**
 * Rate Limit Configuration
 * ไฟล์นี้ดึงการตั้งค่ามาจาก shop.config.json
 * หากต้องการแก้ไขตั้งค่า ให้ไปแก้ไขที่ไฟล์ shop.config.json ที่ root directory
 */
import { getShopConfig } from './config'

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

// ใช้ getter เพื่อให้ค่าถูกดึงมาจาก shop.config.json ตอน runtime เสมอ
export const RATE_LIMIT = {
  get UPLOAD() { return getShopConfig().rateLimit.upload },
  get LOGIN() { return getShopConfig().rateLimit.login },
  get ADMIN_LOGIN() { return getShopConfig().rateLimit.adminLogin },
  get CHECKOUT() { return getShopConfig().rateLimit.checkout },
  get RCON_VERIFY() { return getShopConfig().rateLimit.rconVerify },
  get RCON() { return getShopConfig().rateLimit.rcon },
  get USERS() { return getShopConfig().rateLimit.users },
  get DEFAULT() { return getShopConfig().rateLimit.default },
} as const

/**
 * Get rate limit config for a given path
 */
export function getRateLimitConfigForPath(pathname: string): RateLimitConfig {
  if (pathname.includes('/upload')) return RATE_LIMIT.UPLOAD
  if (pathname.includes('/login')) return RATE_LIMIT.LOGIN
  if (pathname.includes('/checkout')) return RATE_LIMIT.CHECKOUT
  if (pathname.includes('/rcon/verify')) return RATE_LIMIT.RCON_VERIFY
  if (pathname.includes('/rcon')) return RATE_LIMIT.RCON
  if (pathname.includes('/users')) return RATE_LIMIT.USERS
  return RATE_LIMIT.DEFAULT
}
