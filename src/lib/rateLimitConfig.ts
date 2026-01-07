/**
 * Rate Limit Configuration
 * Centralized configuration for API rate limiting
 */

export interface RateLimitConfig {
  windowMs: number   // Time window in milliseconds
  maxRequests: number // Maximum requests per window
}

export const RATE_LIMIT = {
  // File uploads - 10 requests per minute
  UPLOAD: { windowMs: 60000, maxRequests: 10 },
  
  // Login attempts - 20 per minutes (prevent brute force)
  LOGIN: { windowMs: 60000, maxRequests: 20 },
  
  // Admin login - stricter limit (3 per 5 minutes)
  ADMIN_LOGIN: { windowMs: 300000, maxRequests: 3 },
  
  // Checkout - 20 per minute
  CHECKOUT: { windowMs: 60000, maxRequests: 20 },
  
  // RCON verify - 5 per 5 minutes (prevent account enumeration)
  RCON_VERIFY: { windowMs: 300000, maxRequests: 5 },
  
  // RCON commands - 10 per minute
  RCON: { windowMs: 60000, maxRequests: 10 },
  
  // User creation/login - 10 per 5 minutes
  USERS: { windowMs: 300000, maxRequests: 10 },
  
  // Default for other API endpoints
  DEFAULT: { windowMs: 60000, maxRequests: 100 },
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
