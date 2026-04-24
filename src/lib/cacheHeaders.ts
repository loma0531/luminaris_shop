/**
 * Cache Utilities
 * ตั้งค่า Cache Headers สำหรับ API responses
 */

export const CACHE_HEADERS = {
  // 2 minute cache for dynamic data (products, categories)
  SHORT: { 
    'Cache-Control': 'public, max-age=120, stale-while-revalidate=600' 
  },
  
  // 10 minute cache for semi-static data  
  MEDIUM: { 
    'Cache-Control': 'public, max-age=600, stale-while-revalidate=1200' 
  },
  
  // 1 hour cache for static data
  LONG: {
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200'
  },
  
  // No cache for sensitive/auth data
  NONE: { 
    'Cache-Control': 'no-store, no-cache, must-revalidate, private' 
  },
  
  // Private cache for user-specific data (cart, orders, profile)
  // SWR จัดการ freshness ฝั่ง client → ให้ browser cache ได้สั้นๆ
  PRIVATE: {
    'Cache-Control': 'private, max-age=30, stale-while-revalidate=120'
  }
} as const

/**
 * Helper to add cache headers to NextResponse
 */
export function withCacheHeaders(
  headers: Record<string, string>, 
  cacheType: keyof typeof CACHE_HEADERS = 'SHORT'
): Record<string, string> {
  return {
    ...headers,
    ...CACHE_HEADERS[cacheType]
  }
}
