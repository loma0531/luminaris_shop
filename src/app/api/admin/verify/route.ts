import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminToken, extractTokenFromRequest } from '@/lib/adminAuth'
import { logger, createTimer } from '@/lib/logger'

export async function POST(request: NextRequest) {
  const timer = createTimer()
  try {
    const token = extractTokenFromRequest(request)
    
    if (!token) {
      logger.auth.tokenInvalid('No token provided')
      return NextResponse.json({ error: 'No token provided' }, { status: 401 })
    }

    const result = verifyAdminToken(token)
    
    if (!result.valid) {
      logger.auth.tokenInvalid(result.error || 'Invalid token')
      return NextResponse.json({ error: result.error || 'Invalid token' }, { status: 401 })
    }

    logger.auth.tokenVerified(timer())
    return NextResponse.json({ valid: true })
  } catch {
    logger.system.error('Token verification failed')
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
