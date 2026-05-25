import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth, requireUserAuth } from '@/lib/adminAuth'
import { logger, createTimer } from '@/lib/logger'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const timer = createTimer()
  try {
    const { id } = await params
    
    // Check if order exists
    const order = await prisma.order.findUnique({
      where: { id },
      select: { 
        id: true, 
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

    // Update order status to CANCELLED instead of deleting
    // This preserves the order in DB for history/tracking purposes
    await prisma.order.update({
      where: { id },
      data: { 
        status: 'CANCELLED',
      },
    })

    // If order had a payment, update payment status to REJECTED if still pending
    if (order.paymentId) {
      const payment = await prisma.payment.findUnique({ 
        where: { id: order.paymentId },
        select: { status: true }
      })
      
      if (payment && payment.status === 'PENDING') {
        await prisma.payment.update({ 
          where: { id: order.paymentId },
          data: { status: 'REJECTED' }
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    logger.system.error('Failed to cancel order')
    return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 })
  }
}
