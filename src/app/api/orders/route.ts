import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { validatePagination, isValidOrderStatus, isValidMinecraftName } from '@/lib/inputValidation'
import { CACHE_HEADERS } from '@/lib/cache'
import { logger, createTimer } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const timer = createTimer()
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const minecraftName = searchParams.get('minecraftName')
    
    const { page, limit, skip } = validatePagination(searchParams.get('page'), searchParams.get('limit'), 50)

    const whereClause: { status?: 'PENDING' | 'AWAITING_PAYMENT' | 'COMPLETED' | 'CANCELLED'; minecraftName?: string } = {}
    
    if (status && isValidOrderStatus(status)) {
      whereClause.status = status
    }
    
    if (minecraftName && isValidMinecraftName(minecraftName)) {
      whereClause.minecraftName = minecraftName
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: whereClause,
        skip, take: limit,
        select: {
          id: true, orderId: true, minecraftName: true, items: true, total: true,
          status: true, createdAt: true, updatedAt: true,
          payment: { select: { id: true, paymentId: true, status: true } }
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where: whereClause }),
    ])

    logger.order.listViewed(orders.length, 'Admin', timer())

    return NextResponse.json({
      orders, total, page, totalPages: Math.ceil(total / limit),
    }, { headers: CACHE_HEADERS.NONE })
  } catch {
    logger.system.error('Failed to fetch orders')
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}
