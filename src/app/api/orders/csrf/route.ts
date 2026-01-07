import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { storeCSRFToken } from '@/lib/redis'

/**
 * Generate CSRF Token for checkout flow
 * GET /api/orders/csrf
 */
export async function GET() {
  try {
    // Generate session ID and CSRF token
    const sessionId = crypto.randomBytes(16).toString('hex')
    const csrfToken = crypto.randomBytes(32).toString('hex')
    
    // Store in Redis (1 hour TTL)
    await storeCSRFToken(sessionId, csrfToken)
    
    return NextResponse.json({
      sessionId,
      csrfToken,
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to generate CSRF token' },
      { status: 500 }
    )
  }
}
