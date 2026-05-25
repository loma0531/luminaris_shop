import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireUserAuth } from '@/lib/adminAuth'
import { isValidMinecraftName } from '@/lib/inputValidation'
import { CACHE_HEADERS } from '@/lib/cacheHeaders'
import { logger, createTimer } from '@/lib/logger'
import { ORDER_CONFIG } from '@/lib/orderConfig'

export async function POST(request: NextRequest) {
  const timer = createTimer()
  try {
    const { minecraftName } = await request.json()

    if (!minecraftName) {
      return NextResponse.json({ error: 'minecraftName is required' }, { status: 400 })
    }

    // Security: Verify user authentication
    const authError = await requireUserAuth(request, minecraftName)
    if (authError) return authError

    if (!isValidMinecraftName(minecraftName)) {
      logger.security.invalidInput('minecraftName', minecraftName)
      return NextResponse.json({ error: 'Invalid minecraft name format' }, { status: 400 })
    }

    // Find latest pending order (within timeout + 5 min buffer)
    const bufferMs = ORDER_CONFIG.PAYMENT_TIMEOUT_MS + (5 * 60 * 1000)
    const cutoffTime = new Date(Date.now() - bufferMs)

    const latestOrder = await prisma.order.findFirst({
      where: {
        minecraftName: minecraftName,
        status: { in: ['PENDING', 'AWAITING_PAYMENT'] },
        createdAt: { gt: cutoffTime },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        payment: true,
      },
    })

    if (!latestOrder) {
      return NextResponse.json({ found: false }, { headers: CACHE_HEADERS.NONE })
    }

    logger.debug(`${minecraftName} checked latest order: #${latestOrder.orderId}`, 200, timer())

    return NextResponse.json({
      found: true,
      orderId: latestOrder.orderId,
      paymentId: latestOrder.payment?.paymentId,
      amount: latestOrder.total,
      createdAt: latestOrder.createdAt,
    }, { headers: CACHE_HEADERS.NONE })
  } catch {
    logger.system.error('Failed to fetch latest order')
    return NextResponse.json({ error: 'Failed to fetch latest order' }, { status: 500 })
  }
}
