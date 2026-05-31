import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'
import { generateAdminToken } from '@/lib/adminAuth'
import { verifyTOTP } from '@/lib/totp'
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
        { error: 'ส่งคำขอเข้าสู่ระบบมากเกินไป กรุณาลองใหม่อีกครั้งในภายหลัง' },
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
        { error: 'ส่งคำขอเข้าสู่ระบบมากเกินไป กรุณาลองใหม่อีกครั้งในภายหลัง' },
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
      return NextResponse.json({ error: 'จำเป็นต้องระบุอีเมล รหัสผ่าน และโทเคน' }, { status: 400 })
    }

    logger.auth.adminLoginAttempt(email)

    const adminUser = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (!adminUser) {
      await bcrypt.compare(password, '$2a$10$dummyhashforcomparison')
      await bcrypt.compare(token, '$2a$10$dummyhashforcomparison')
      logger.auth.adminLoginFailed(email, 'User not found')
      return NextResponse.json({ error: 'อีเมล รหัสผ่าน หรือโทเคนไม่ถูกต้อง' }, { status: 401 })
    }

    const isPasswordValid = await bcrypt.compare(password, adminUser.passwordHash)
    
    let isTokenValid = false
    if (adminUser.twoFactorSecret) {
      // Verify using Google Authenticator TOTP 2FA
      isTokenValid = verifyTOTP(token, adminUser.twoFactorSecret)
    } else if (adminUser.tokenHash) {
      // Fallback to legacy static token
      isTokenValid = await bcrypt.compare(token, adminUser.tokenHash)
    }

    if (!isPasswordValid || !isTokenValid) {
      logger.auth.adminLoginFailed(email, 'Invalid credentials')
      return NextResponse.json({ error: 'อีเมล รหัสผ่าน หรือโทเคนไม่ถูกต้อง' }, { status: 401 })
    }

    const sessionToken = await generateAdminToken()
    
    logger.auth.adminLoginSuccess(email, timer())

    return NextResponse.json({ success: true, sessionToken })
  } catch {
    logger.system.error('Admin login failed')
    return NextResponse.json({ error: 'เข้าสู่ระบบล้มเหลว' }, { status: 500 })
  }
}
