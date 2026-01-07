import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'
import { generateAdminToken } from '@/lib/adminAuth'
import { logger, createTimer } from '@/lib/logger'

export async function POST(request: NextRequest) {
  const timer = createTimer()
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
