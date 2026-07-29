import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireUserAuth } from '@/lib/adminAuth'
import { logger } from '@/lib/logger'
import { OrderService } from '@/core/services/OrderService'
import { rateLimit } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderId, paymentId } = body

    if (!orderId || typeof orderId !== 'number') {
      return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 })
    }
    if (!paymentId || typeof paymentId !== 'number') {
      return NextResponse.json({ error: 'Invalid payment ID' }, { status: 400 })
    }

    // 1. Rate Limiting เพื่อป้องกัน spam การชำระเงิน (10 requests per minute)
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const rateLimitResult = await rateLimit(`coin-purchase:${ip}`, {
      limit: 10,
      windowMs: 60000,
    })
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'ส่งคำขอมากเกินไป กรุณารอสักครู่' },
        { status: 429 }
      )
    }

    // 2. ดึงข้อมูล Order และ Payment
    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) {
      return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 })
    }

    if (order.isTopUp) {
      return NextResponse.json({ error: 'ไม่สามารถชำระเงินสำหรับการเติมเงินด้วย Coin ได้' }, { status: 400 })
    }

    // ตรวจสิทธิ์ — ต้องเป็นเจ้าของ Order
    const authError = await requireUserAuth(request, order.minecraftName)
    if (authError) {
      logger.security.accessDenied(`Order ${orderId}`, 'Coin checkout without ownership')
      return authError
    }

    if (order.status !== 'AWAITING_PAYMENT') {
      return NextResponse.json({ error: 'คำสั่งซื้อนี้ไม่อยู่ในสถานะรอชำระเงิน' }, { status: 400 })
    }

    const payment = await prisma.payment.findUnique({ where: { paymentId } })
    if (!payment) {
      return NextResponse.json({ error: 'ไม่พบรายการชำระเงิน' }, { status: 404 })
    }

    if (payment.status !== 'PENDING') {
      return NextResponse.json({ error: 'รายการชำระเงินนี้ถูกดำเนินการไปแล้ว' }, { status: 400 })
    }

    // 3. ตรวจสอบยอด Coin ในฐานข้อมูลแบบ Atomic ใน Transaction
    try {
      await prisma.$transaction(async (tx) => {
        const userObj = await tx.user.findFirst({
          where: {
            minecraftName: {
              equals: order.minecraftName,
              mode: 'insensitive'
            }
          }
        })

        if (!userObj || userObj.coins < order.total) {
          throw new Error('ยอด Coin ของคุณมีไม่เพียงพอสำหรับการชำระเงิน')
        }

        // หักเหรียญ Coin
        await tx.user.update({
          where: { id: userObj.id },
          data: { coins: { decrement: order.total } }
        })

        // บันทึกธุรกรรมการใช้ Coin
        await tx.coinTransaction.create({
          data: {
            minecraftName: order.minecraftName,
            amount: -order.total,
            type: 'PURCHASE',
            description: `ชำระเงินออเดอร์ #${orderId}`,
          }
        })
      })
    } catch (txError: any) {
      return NextResponse.json({ error: txError.message || 'เกิดข้อผิดพลาดในการหักเหรียญ' }, { status: 400 })
    }

    // 4. ดำเนินการ Complete Order ชำระเงินสำเร็จ (RCON + Discord log ในตัว)
    const completeResult = await OrderService.completeOrder(
      orderId,
      paymentId,
      'coin',
      `COIN-${Date.now()}`
    )

    logger.info(`Order #${orderId} paid with Coins successfully by ${order.minecraftName}`)

    return NextResponse.json({
      success: true,
      orderId,
      paymentId,
      status: 'COMPLETED',
      delivery: {
        status: completeResult.fulfillment.status === 'SUCCESS' ? 'SUCCESS' : 'QUEUED',
        message: completeResult.fulfillment.message,
      }
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Coin purchase failed: ${errorMessage}`)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการชำระเงินด้วย Coin' }, { status: 500 })
  }
}
