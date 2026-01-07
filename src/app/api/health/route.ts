import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { testMySQLConnection } from '@/lib/mysql'
import { testRedisConnection } from '@/lib/redis'
import { HealthStatus } from '@/lib/types'

const APP_VERSION = '0.1.0'

export async function GET() {
  const timestamp = new Date().toISOString()
  
  const checks = {
    mongodb: false,
    mysql: false,
    redis: false
  }

  // Check MongoDB (via Prisma)
  try {
    await prisma.$runCommandRaw({ ping: 1 })
    checks.mongodb = true
  } catch {
    // MongoDB check failed
  }

  // Check MySQL
  try {
    checks.mysql = await testMySQLConnection()
  } catch {
    // MySQL check failed
  }

  // Check Redis
  try {
    checks.redis = await testRedisConnection()
  } catch {
    // Redis check failed
  }

  // Determine overall status
  let status: HealthStatus['status'] = 'healthy'
  const allChecks = Object.values(checks)
  
  if (allChecks.every(c => !c)) {
    status = 'unhealthy'
  } else if (allChecks.some(c => !c)) {
    status = 'degraded'
  }

  const healthStatus: HealthStatus = {
    status,
    timestamp,
    checks,
    version: APP_VERSION
  }

  return NextResponse.json(healthStatus, {
    status: status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
  })
}
