import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isValidMinecraftName } from '@/lib/inputValidation'
import { CACHE_HEADERS } from '@/lib/cacheHeaders'
import { requireUserAuth } from '@/lib/adminAuth'
import { logger, createTimer } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const timer = createTimer()
  try {
    const { searchParams } = new URL(request.url)
    const minecraftName = searchParams.get('minecraftName')
    const status = searchParams.get('status')

    if (!minecraftName) {
      return NextResponse.json({ error: 'minecraftName is required' }, { status: 400 })
    }

    const authError = requireUserAuth(request, minecraftName)
    if (authError) return authError

    if (!isValidMinecraftName(minecraftName)) {
      logger.security.invalidInput('minecraftName', minecraftName)
      return NextResponse.json({ error: 'Invalid minecraft name format' }, { status: 400 })
    }

    let statusFilter: ('PENDING' | 'AWAITING_PAYMENT' | 'COMPLETED' | 'CANCELLED')[] = ['PENDING', 'AWAITING_PAYMENT']
    let statusLabel = 'pending'
    
    if (status === 'completed') {
      statusFilter = ['COMPLETED']
      statusLabel = 'completed'
    } else if (status === 'pending') {
      statusFilter = ['PENDING', 'AWAITING_PAYMENT']
      statusLabel = 'pending'
    } else if (status === 'history') {
      statusFilter = ['COMPLETED', 'CANCELLED']
      statusLabel = 'history'
    } else if (status === 'all') {
      statusFilter = ['PENDING', 'AWAITING_PAYMENT', 'COMPLETED', 'CANCELLED']
      statusLabel = 'all'
    } else if (status === 'AWAITING_PAYMENT') {
      statusFilter = ['AWAITING_PAYMENT']
      statusLabel = 'awaiting payment'
    }

    const orders = await prisma.order.findMany({
      where: { minecraftName, status: { in: statusFilter } },
      select: {
        id: true, orderId: true, minecraftName: true, items: true, total: true,
        status: true, createdAt: true, updatedAt: true,
        payment: { select: { id: true, paymentId: true, status: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 20, // Reduced from 50 for better performance
    })

    logger.debug(`${minecraftName} viewed orders (${statusLabel}): ${orders.length} orders`, 200, timer())

    return NextResponse.json({ orders }, { headers: CACHE_HEADERS.NONE })
  } catch {
    logger.system.error('Failed to fetch user orders')
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}
