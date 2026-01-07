import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

// Secret key for signing tokens - now strictly validated
const SECRET_KEY = env.NEXTAUTH_SECRET

// Token expiry time (24 hours)
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000

/**
 * Common interface for decoded token payload
 */
interface TokenPayload {
  type: string
  createdAt: number
  nonce: string
  minecraftName?: string
}

/**
 * Internal helper to generate a signed token
 */
function createSignedToken(payload: TokenPayload): string {
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64')
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(payloadBase64)
    .digest('hex')
  
  return `${payloadBase64}.${signature}`
}

/**
 * Internal helper to verify token signature and basic structure
 */
function verifyTokenSignature<T extends TokenPayload>(token: string, expectedType: string): { valid: boolean, payload?: T, error?: string } {
  if (!token) return { valid: false, error: 'No token provided' }

  const parts = token.split('.')
  if (parts.length !== 2) return { valid: false, error: 'Invalid token format' }

  const [payloadBase64, signature] = parts
  const expectedSignature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(payloadBase64)
    .digest('hex')

  if (signature !== expectedSignature) return { valid: false, error: 'Invalid token signature' }

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString()) as T
    
    if (payload.type !== expectedType) {
      return { valid: false, error: `Invalid token type: ${payload.type}` }
    }

    return { valid: true, payload }
  } catch {
    return { valid: false, error: 'Invalid token payload' }
  }
}

/**
 * Generate a secure admin token with HMAC signature
 */
export function generateAdminToken(): string {
  return createSignedToken({
    type: 'admin',
    createdAt: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  })
}

/**
 * Verify an admin token
 * Returns { valid: true } if valid, or { valid: false, error: string } if not
 */
export function verifyAdminToken(token: string): { valid: boolean; error?: string } {
  const verification = verifyTokenSignature(token, 'admin')
  
  if (!verification.valid || !verification.payload) {
    if (verification.error?.includes('Invalid token type')) {
      logger.security.accessDenied('verifyAdminToken', verification.error)
    }
    return { valid: false, error: verification.error }
  }

  if (Date.now() - verification.payload.createdAt > TOKEN_EXPIRY_MS) {
    return { valid: false, error: 'Token expired' }
  }

  return { valid: true }
}

/**
 * Async version of verifyAdminToken with Redis revocation check
 */
export async function verifyAdminTokenAsync(token: string): Promise<{ valid: boolean; error?: string }> {
  // First do synchronous validation
  const syncResult = verifyAdminToken(token)
  if (!syncResult.valid) {
    return syncResult
  }

  // Then check Redis for revocation
  try {
    const { isTokenRevoked } = await import('@/lib/redis')
    const revoked = await isTokenRevoked(token)
    if (revoked) {
      return { valid: false, error: 'Token has been revoked' }
    }
  } catch {
    // If Redis is unavailable, allow the request (fail-open for availability)
  }

  return { valid: true }
}

/**
 * Extract token from request Authorization header
 */
export function extractTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  return authHeader.split(' ')[1]
}

/**
 * Middleware helper to verify admin authentication
 * Returns null if authenticated, or an error response if not
 */
export function requireAdminAuth(request: NextRequest): NextResponse | null {
  const token = extractTokenFromRequest(request)
  
  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  const verification = verifyAdminToken(token)
  
  if (!verification.valid) {
    return NextResponse.json(
      { error: verification.error || 'Invalid token' },
      { status: 401 }
    )
  }

  return null // Authentication successful
}

/**
 * Generate a session token for a shop user
 */
export function generateShopToken(minecraftName: string): string {
  return createSignedToken({
    type: 'shop',
    minecraftName: minecraftName.toLowerCase(),
    createdAt: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  })
}

/**
 * Verify a shop token and ensure it matches the requested name
 */
export function verifyShopToken(token: string | null, minecraftName?: string): { valid: boolean; error?: string } {
  if (!token) return { valid: false, error: 'No token provided' }

  const verification = verifyTokenSignature(token, 'shop')
  
  if (!verification.valid || !verification.payload) {
    return { valid: false, error: verification.error }
  }

  const payload = verification.payload

  // Tokens expire after 7 days
  if (Date.now() - payload.createdAt > 7 * 24 * 60 * 60 * 1000) {
    return { valid: false, error: 'Token expired' }
  }

  if (minecraftName && payload.minecraftName !== minecraftName.toLowerCase()) {
    return { valid: false, error: 'Token name mismatch' }
  }

  return { valid: true }
}

/**
 * Middleware helper for user authentication
 */
export function requireUserAuth(request: NextRequest, minecraftName?: string): NextResponse | null {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null
  
  const verification = verifyShopToken(token, minecraftName)
  
  if (!verification.valid) {
    return NextResponse.json(
      { error: verification.error || 'User authentication required' },
      { status: 401 }
    )
  }

  return null
}

