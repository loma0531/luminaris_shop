/**
 * Cache Utilities
 * ตั้งค่า Cache Headers สำหรับ API responses
 */

export const CACHE_HEADERS = {
  // 1 minute cache for dynamic data (products, categories)
  SHORT: { 
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' 
  },
  
  // 5 minute cache for semi-static data  
  MEDIUM: { 
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' 
  },
  
  // 1 hour cache for static data
  LONG: {
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200'
  },
  
  // No cache for user-specific or sensitive data
  NONE: { 
    'Cache-Control': 'no-store, no-cache, must-revalidate, private' 
  },
  
  // Private cache (only browser, not CDN)
  PRIVATE: {
    'Cache-Control': 'private, max-age=60'
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
