
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { logger, createTimer } from '@/lib/logger'
import { ORDER_CONFIG } from '@/lib/orderConfig'

export async function POST(request: NextRequest) {
  const timer = createTimer()
  // Option: Protect with admin auth or a CRON_SECRET header
  // For now, let's protect with Admin Auth to prevent abuse, 
  // but if this is for a cron job, we might need a secret key check instead.
  // Given the context, manual trigger or admin-triggered is safest.
  const authError = await requireAdminAuth(request)
  if (authError) return authError

  try {
    // Cleanup orders older than payment timeout
    const cutoffTime = new Date(Date.now() - ORDER_CONFIG.PAYMENT_TIMEOUT_MS)

    // Mark old pending/awaiting_payment orders as CANCELLED (preserving history)
    const cancelledOrders = await prisma.order.updateMany({
      where: {
        status: {
            in: ['PENDING', 'AWAITING_PAYMENT']
        },
        createdAt: {
          lt: cutoffTime,
        },
      },
      data: {
        status: 'CANCELLED',
      },
    })

    // Mark old pending payments as REJECTED (preserving history)
    const rejectedPayments = await prisma.payment.updateMany({
      where: {
        status: 'PENDING',
        createdAt: {
          lt: cutoffTime,
        },
      },
      data: {
        status: 'REJECTED',
      },
    })

    logger.info(`Cleanup: Cancelled ${cancelledOrders.count} orders, rejected ${rejectedPayments.count} payments`, 200, timer())

    return NextResponse.json({
      success: true,
      cancelledOrders: cancelledOrders.count,
      rejectedPayments: rejectedPayments.count,
      message: `Cancelled ${cancelledOrders.count} expired orders and rejected ${rejectedPayments.count} expired payments.`
    })
  } catch {
    logger.system.error('Failed to cleanup orders')
    return NextResponse.json({ error: 'Failed to cleanup' }, { status: 500 })
  }
}
