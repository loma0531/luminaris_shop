import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth, requireUserAuth } from '@/lib/adminAuth'
import { logger } from '@/lib/logger'
import { OrderService } from '@/core/services/OrderService'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Check if order exists
    const order = await prisma.order.findUnique({
      where: { id },
      select: { 
        id: true, 
        orderId: true,
        status: true, 
        paymentId: true,
        minecraftName: true
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // SECURITY: Verify authorization
    // 1. Check if admin
    const adminAuthError = await requireAdminAuth(request)
    const isAdmin = !adminAuthError

    // 2. Check if owner (must have valid shopToken matching minecraftName)
    let isOwner = false
    if (!isAdmin) {
      const userAuthError = await requireUserAuth(request, order.minecraftName)
      isOwner = !userAuthError
    }

    if (!isAdmin && !isOwner) {
      logger.security.accessDenied(`Order ${id}`, 'Attempted deletion without ownership or admin rights')
      return NextResponse.json({ error: 'Unauthorized to cancel this order' }, { status: 403 })
    }

    // Allow cancellation only if status is pending/awaiting payment
    if (order.status !== 'PENDING' && order.status !== 'AWAITING_PAYMENT') {
       return NextResponse.json({ error: 'Cannot cancel processed order' }, { status: 400 })
    }

    // เรียกใช้ OrderService เพื่อยกเลิกออเดอร์ (และยกเลิกธุรกรรมบน Stripe)
    await OrderService.cancelOrder(order.orderId)

    return NextResponse.json({ success: true })
  } catch {
    logger.system.error('Failed to cancel order')
    return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 })
  }
}
