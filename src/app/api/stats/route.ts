import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { CACHE_HEADERS } from '@/lib/cacheHeaders'
import { logger } from '@/lib/logger'
import { getCachedStats, setCachedStats } from '@/lib/redis'

interface StatsData {
  totalAmount: number
  totalCount: number
  leaderboard: { minecraftName: string; total: number; count: number }[]
  recentTransactions: { minecraftName: string; amount: number; date: string }[]
}

export async function GET() {
  try {
    // Try cache first (1-5ms)
    const cached = await getCachedStats<StatsData>()
    if (cached) {
      logger.debug('Stats served from cache')
      return NextResponse.json(cached, { headers: CACHE_HEADERS.SHORT })
    }

    // Cache miss - query database (heavy query)
    // Use Prisma aggregation for better performance
    const [totalStats, leaderboardData, recentTransactions] = await Promise.all([
      // Get total amount and count in one query
      prisma.payment.aggregate({
        where: {
          status: 'VERIFIED',
          OR: [
            { paymentMethod: { isSet: false } },
            { paymentMethod: { not: 'coin' } }
          ]
        },
        _sum: { amount: true },
        _count: true
      }),
      
      // Get top 10 users by total spent using groupBy
      prisma.payment.groupBy({
        by: ['minecraftName'],
        where: {
          status: 'VERIFIED',
          OR: [
            { paymentMethod: { isSet: false } },
            { paymentMethod: { not: 'coin' } }
          ]
        },
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: 'desc' } },
        take: 10
      }),
      
      // Get recent 10 transactions
      prisma.payment.findMany({
        where: {
          status: 'VERIFIED',
          OR: [
            { paymentMethod: { isSet: false } },
            { paymentMethod: { not: 'coin' } }
          ]
        },
        select: {
          minecraftName: true,
          amount: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    ])

    const totalAmount = totalStats._sum.amount || 0
    const totalCount = totalStats._count

    // Format leaderboard
    const leaderboard = leaderboardData.map((item) => ({
      minecraftName: item.minecraftName,
      total: item._sum.amount || 0,
      count: item._count,
    }))

    // Format recent transactions
    const recent = recentTransactions.map((p) => ({
      minecraftName: p.minecraftName,
      amount: p.amount,
      date: p.createdAt.toISOString(),
    }))

    const statsData: StatsData = {
      totalAmount,
      totalCount,
      leaderboard,
      recentTransactions: recent,
    }

    // Cache the result for 30 seconds
    await setCachedStats(statsData)

    return NextResponse.json(statsData, { headers: CACHE_HEADERS.SHORT })
  } catch {
    logger.system.error('Failed to fetch stats')
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
