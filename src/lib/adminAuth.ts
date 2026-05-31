import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

import { SignJWT, jwtVerify } from 'jose'

// Secret key for signing tokens - now strictly validated
const SECRET_KEY = env.NEXTAUTH_SECRET
const secretKeyBytes = new TextEncoder().encode(SECRET_KEY)

// Token expiry time
const ADMIN_TOKEN_EXPIRY = '24h'
const SHOP_TOKEN_EXPIRY = '7d'

/**
 * Common interface for decoded token payload
 */
interface TokenPayload {
  type: string
  nonce: string
  minecraftName?: string
  [key: string]: unknown
}

/**
 * Internal helper to generate a signed token
 */
async function createSignedToken(payload: TokenPayload, expiresIn: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKeyBytes)
}

/**
 * Internal helper to verify token signature and basic structure
 */
/**
 * Internal helper to verify token signature and basic structure
 */
async function verifyTokenSignature<T extends TokenPayload>(token: string, expectedType: string): Promise<{ valid: boolean, payload?: T, error?: string }> {
  if (!token) return { valid: false, error: 'No token provided' }

  try {
    const { payload } = await jwtVerify(token, secretKeyBytes, {
      algorithms: ['HS256']
    })
    
    if (payload.type !== expectedType) {
      return { valid: false, error: `Invalid token type: ${payload.type}` }
    }

    return { valid: true, payload: payload as unknown as T }
  } catch (err) {
    const error = err as Error & { code?: string }
    if (error?.code === 'ERR_JWT_EXPIRED') {
      return { valid: false, error: 'Token expired' }
    }
    return { valid: false, error: 'Invalid token signature or payload' }
  }
}

/**
 * Generate a secure admin token with HMAC signature
 */
export async function generateAdminToken(): Promise<string> {
  return createSignedToken({
    type: 'admin',
    nonce: crypto.randomBytes(16).toString('hex'),
  }, ADMIN_TOKEN_EXPIRY)
}

/**
 * Verify an admin token
 * Returns { valid: true } if valid, or { valid: false, error: string } if not
 */
export async function verifyAdminToken(token: string): Promise<{ valid: boolean; error?: string }> {
  const verification = await verifyTokenSignature(token, 'admin')
  
  if (!verification.valid || !verification.payload) {
    if (verification.error?.includes('Invalid token type')) {
      logger.security.accessDenied('verifyAdminToken', verification.error)
    }
    return { valid: false, error: verification.error }
  }

  return { valid: true }
}

/**
 * Async version of verifyAdminToken with Redis revocation check
 */
export async function verifyAdminTokenAsync(token: string): Promise<{ valid: boolean; error?: string }> {
  // First do synchronous validation
  const syncResult = await verifyAdminToken(token)
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
  } catch (error) {
    // FAIL-SECURE: ถ้า check revocation ไม่ได้ ให้ block request
    logger.system.error(`Token revocation check failed, blocking request: ${error}`)
    return { valid: false, error: 'Security verification failed' }
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
export async function requireAdminAuth(request: NextRequest): Promise<NextResponse | null> {
  const token = extractTokenFromRequest(request)
  
  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  const verification = await verifyAdminToken(token)
  
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
export async function generateShopToken(minecraftName: string): Promise<string> {
  return createSignedToken({
    type: 'shop',
    minecraftName: minecraftName.toLowerCase(),
    nonce: crypto.randomBytes(16).toString('hex'),
  }, SHOP_TOKEN_EXPIRY)
}

/**
 * Verify a shop token and ensure it matches the requested name
 */
export async function verifyShopToken(token: string | null, minecraftName?: string): Promise<{ valid: boolean; error?: string }> {
  if (!token) return { valid: false, error: 'No token provided' }

  const verification = await verifyTokenSignature(token, 'shop')
  
  if (!verification.valid || !verification.payload) {
    return { valid: false, error: verification.error }
  }

  const payload = verification.payload

  if (minecraftName && payload.minecraftName !== minecraftName.toLowerCase()) {
    return { valid: false, error: 'Token name mismatch' }
  }

  return { valid: true }
}

/**
 * Middleware helper for user authentication
 */
export async function requireUserAuth(request: NextRequest, minecraftName?: string): Promise<NextResponse | null> {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null
  
  const verification = await verifyShopToken(token, minecraftName)
  
  if (!verification.valid) {
    return NextResponse.json(
      { error: verification.error || 'User authentication required' },
      { status: 401 }
    )
  }

  return null
}

