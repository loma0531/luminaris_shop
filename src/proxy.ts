import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { logger } from '@/lib/logger'
import { getRateLimitConfigForPath } from '@/lib/rateLimitConfig'

// LRU Cache implementation for rate limiting (max 10,000 entries to prevent memory leak)
const MAX_CACHE_SIZE = 10000

interface RateLimitEntry {
  count: number
  resetTime: number
}

class LRUCache<K, V> {
  private cache: Map<K, V>
  private maxSize: number

  constructor(maxSize: number) {
    this.cache = new Map()
    this.maxSize = maxSize
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  set(key: K, value: V): void {
    // Delete existing to update position
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      } else {
        break
      }
    }
    this.cache.set(key, value)
  }

  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  entries(): IterableIterator<[K, V]> {
    return this.cache.entries()
  }
}

// In-memory fallback with LRU eviction
const rateLimitStore = new LRUCache<string, RateLimitEntry>(MAX_CACHE_SIZE)
let cleanupCounter = 0

function cleanupRateLimitStore() {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}

function checkRateLimitInMemory(ip: string, pathname: string): { allowed: boolean; remaining: number } {
  const config = getRateLimitConfigForPath(pathname)
  const endpointGroup = pathname.split('/').slice(0, 4).join('/')
  const key = `${ip}:${endpointGroup}`
  const now = Date.now()
  
  cleanupCounter++
  if (cleanupCounter >= 100) {
    cleanupCounter = 0
    cleanupRateLimitStore()
  }

  const entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + config.windowMs })
    return { allowed: true, remaining: config.maxRequests - 1 }
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0 }
  }

  entry.count++
  rateLimitStore.set(key, entry) // Update position in LRU
  return { allowed: true, remaining: config.maxRequests - entry.count }
}

function getClientIP(request: NextRequest): string {
  // If behind Cloudflare or trusted proxy, use that header safely. 
  const cfConnecting = request.headers.get('cf-connecting-ip')
  if (cfConnecting) return cfConnecting.trim()
  const forwarded = request.headers.get('x-forwarded-for')
  // Warning: x-forwarded-for can be spoofed, take the right-most (closest proxy) or just take the first if trusted
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIP = request.headers.get('x-real-ip')
  if (realIP) return realIP.trim()
  return 'unknown'
}

// Format timestamp: DD/MM/YYYY HH:MM:SS
function formatTimestamp(): string {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

// Color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',      // 2xx success / INFO
  yellow: '\x1b[33m',     // 3xx redirect / WARN
  red: '\x1b[31m',        // 4xx/5xx error
  cyan: '\x1b[36m',       // DEBUG
  magenta: '\x1b[35m',    // SECURITY
}

// Body size limit (1MB) - prevents DoS attacks
const MAX_BODY_SIZE = 1 * 1024 * 1024 // 1MB

// Content Security Policy - restrictive for API, relaxed for pages
const CSP_API = "default-src 'none'; frame-ancestors 'none'"
const CSP_PAGE = "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://mc-heads.net https://crafatar.com https://texture.geysermc.org https://*.stripe.com; font-src 'self'; connect-src 'self' https://api.stripe.com; frame-src 'self' https://js.stripe.com https://hooks.stripe.com; frame-ancestors 'self'"

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return COLORS.green
  if (status >= 300 && status < 400) return COLORS.yellow
  return COLORS.red
}



export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const method = request.method
  const ip = getClientIP(request)
  
  // Generate Request ID for tracking
  const requestId = crypto.randomUUID()
  
  // Only apply to /api routes
  if (pathname.startsWith('/api')) {
    // Check body size for POST/PUT/PATCH requests (skip upload routes)
    if (['POST', 'PUT', 'PATCH'].includes(method) && !pathname.includes('/upload')) {
      const contentLength = request.headers.get('content-length')
      if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
        logger.security.suspiciousActivity(`Content-Length size exceeded: ${contentLength} bytes`, ip)
        return NextResponse.json(
          { error: 'Request body too large. Maximum size is 1MB.' },
          { 
            status: 413,
            headers: { 'X-Request-ID': requestId }
          }
        )
      }
      // Also verify actual stream size limits within the app routes where relevant
    }

    // Log API request with Request ID
    logger.api.request(method, pathname)

    // Get rate limit config
    const config = getRateLimitConfigForPath(pathname)
    const endpointGroup = pathname.split('/').slice(0, 4).join('/')
    const rateLimitKey = `${ip}:${endpointGroup}`
    
    let rateCheck = { allowed: true, remaining: config.maxRequests }
    
    // Try Redis rate limiting first
    try {
      // Dynamic import to avoid edge runtime issues
      const { checkRateLimitRedis } = await import('@/lib/redis')
      const redisResult = await checkRateLimitRedis(rateLimitKey, config.maxRequests, config.windowMs)
      rateCheck = { allowed: redisResult.allowed, remaining: redisResult.remaining }
    } catch {
      // Fallback to in-memory rate limiting
      rateCheck = checkRateLimitInMemory(ip, pathname)
    }
    
    if (!rateCheck.allowed) {
      logger.security.rateLimitExceeded(pathname)
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { 
          status: 429,
          headers: {
            'Retry-After': '60',
            'X-RateLimit-Remaining': '0',
            'X-Request-ID': requestId
          }
        }
      )
    }

    // We rely on rate limiting for public endpoints and 
    // requireAdminAuth() within specific sensitive admin routes.
    
    // Add headers to successful responses
    const response = NextResponse.next()
    response.headers.set('X-RateLimit-Remaining', String(rateCheck.remaining))
    response.headers.set('X-Request-ID', requestId)
    
    // Add API version header
    response.headers.set('X-API-Version', '1.0')
    
    // Add security headers
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set('Content-Security-Policy', CSP_API)
    
    return response
  }

  // For non-API routes, just add security headers
  const response = NextResponse.next()
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'SAMEORIGIN')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Content-Security-Policy', CSP_PAGE)
  response.headers.set('X-Request-ID', requestId)
  
  return response
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|uploads).*)',
  ],
}
