import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { isValidObjectId, isValidPaymentStatus } from '@/lib/inputValidation'
import { logger, createTimer } from '@/lib/logger'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const timer = createTimer()
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    const { id } = await params
    
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid payment ID format' }, { status: 400 })
    }
    
    const body = await request.json()
    const { status } = body

    if (!isValidPaymentStatus(status)) {
      logger.warn(`Invalid payment status: ${status}`, 400)
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 })
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
      select: { id: true, paymentId: true, status: true, minecraftName: true, amount: true }
    })

    if (!payment) {
      logger.payment.notFound(parseInt(id) || 0)
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    if (payment.status === 'VERIFIED' && status === 'VERIFIED') {
      logger.payment.alreadyProcessed(payment.paymentId)
      return NextResponse.json({ error: 'Payment already verified' }, { status: 400 })
    }

    const updatedPayment = await prisma.payment.update({
      where: { id },
      data: { status, verifiedAt: status === 'VERIFIED' ? new Date() : null },
    })

    logger.payment.statusChanged(payment.paymentId, payment.status, status, timer())
    
    if (status === 'VERIFIED') {
      logger.payment.slipVerified(payment.paymentId, payment.minecraftName, payment.amount, timer())
    }

    return NextResponse.json(updatedPayment)
  } catch {
    logger.system.error('Failed to update payment')
    return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 })
  }
}
