import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'
import { generateAdminToken } from '@/lib/adminAuth'
import { logger, createTimer, getClientIP } from '@/lib/logger'
import { RATE_LIMIT } from '@/lib/rateLimitConfig'

// In-memory rate limit fallback for admin login
const loginAttempts = new Map<string, { count: number; resetTime: number }>()

export async function POST(request: NextRequest) {
  const timer = createTimer()
  const ip = getClientIP(request.headers)
  
  // Rate limiting check for admin login
  try {
    const { checkRateLimitRedis } = await import('@/lib/redis')
    const rateCheck = await checkRateLimitRedis(
      `admin_login:${ip}`,
      RATE_LIMIT.ADMIN_LOGIN.maxRequests,
      RATE_LIMIT.ADMIN_LOGIN.windowMs
    )
    if (!rateCheck.allowed) {
      logger.security.rateLimitExceeded('/api/admin/login')
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': '300' } }
      )
    }
  } catch {
    // Fallback to in-memory rate limiting
    const now = Date.now()
    const entry = loginAttempts.get(ip)
    if (entry && now < entry.resetTime && entry.count >= RATE_LIMIT.ADMIN_LOGIN.maxRequests) {
      logger.security.rateLimitExceeded('/api/admin/login')
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': '300' } }
      )
    }
    if (!entry || now >= entry.resetTime) {
      loginAttempts.set(ip, { count: 1, resetTime: now + RATE_LIMIT.ADMIN_LOGIN.windowMs })
    } else {
      entry.count++
    }
  }

  try {
    const body = await request.json()
    const { email, password, token } = body

    if (!email || !password || !token) {
      logger.auth.adminLoginFailed(email || 'unknown', 'Missing credentials')
      return NextResponse.json({ error: 'Email, password, and token are required' }, { status: 400 })
    }

    logger.auth.adminLoginAttempt(email)

    const adminUser = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (!adminUser) {
      await bcrypt.compare(password, '$2a$10$dummyhashforcomparison')
      await bcrypt.compare(token, '$2a$10$dummyhashforcomparison')
      logger.auth.adminLoginFailed(email, 'User not found')
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const isPasswordValid = await bcrypt.compare(password, adminUser.passwordHash)
    if (!isPasswordValid) {
      logger.auth.adminLoginFailed(email, 'Invalid password')
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const isTokenValid = await bcrypt.compare(token, adminUser.tokenHash)
    if (!isTokenValid) {
      logger.auth.adminLoginFailed(email, 'Invalid token')
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const sessionToken = generateAdminToken()
    
    logger.auth.adminLoginSuccess(email, timer())

    return NextResponse.json({ success: true, sessionToken })
  } catch {
    logger.system.error('Admin login failed')
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
