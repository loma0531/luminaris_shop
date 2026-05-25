import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { logger } from '@/lib/logger'
import { ORDER_CONFIG } from '@/lib/orderConfig'

/**
 * Order Cleanup Cron Endpoint
 * ยกเลิก orders ที่รอชำระเงินเกินเวลาที่กำหนด
 */
export async function GET(request: NextRequest) {
  // Require admin authentication for manual trigger
  // Or check for cron secret header
  const cronSecret = request.headers.get('x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET

  const isAuthorizedByCron = !!expectedSecret && cronSecret === expectedSecret
  if (!isAuthorizedByCron) {
    const authError = await requireAdminAuth(request)
    if (authError) return authError
  }

  try {
    // Calculate cutoff time based on payment timeout
    const cutoffTime = new Date(Date.now() - ORDER_CONFIG.PAYMENT_TIMEOUT_MS)

    // Find and cancel expired orders
    const expiredOrders = await prisma.order.findMany({
      where: {
        status: 'AWAITING_PAYMENT',
        createdAt: { lt: cutoffTime }
      },
      select: {
        id: true,
        orderId: true,
        minecraftName: true,
        paymentId: true
      }
    })

    if (expiredOrders.length === 0) {
      logger.info('Order cleanup: No expired orders found', 200)
      return NextResponse.json({ 
        success: true, 
        message: 'No expired orders found',
        cancelled: 0 
      })
    }

    // Cancel orders and reject payments in a transaction
    const orderIds = expiredOrders.map(o => o.id)
    const paymentIds = expiredOrders.map(o => o.paymentId).filter((id): id is string => id !== null)

    await prisma.$transaction([
      prisma.order.updateMany({
        where: { id: { in: orderIds } },
        data: { status: 'CANCELLED' }
      }),
      ...(paymentIds.length > 0 ? [
        prisma.payment.updateMany({
          where: { 
            id: { in: paymentIds },
            status: 'PENDING'
          },
          data: { status: 'REJECTED' }
        })
      ] : [])
    ])

    // Log each cancelled order
    for (const order of expiredOrders) {
      logger.order.cancelled(order.orderId, order.minecraftName, 'Payment timeout')
    }

    logger.info(`Order cleanup: Cancelled ${expiredOrders.length} expired orders`, 200)

    return NextResponse.json({
      success: true,
      message: `Cancelled ${expiredOrders.length} expired orders`,
      cancelled: expiredOrders.length,
      orders: expiredOrders.map(o => ({
        orderId: o.orderId,
        minecraftName: o.minecraftName
      }))
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Order cleanup failed: ${errorMessage}`)
    return NextResponse.json(
      { error: 'Cleanup failed' },
      { status: 500 }
    )
  }
}
