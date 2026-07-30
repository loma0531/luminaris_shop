/**
 * POST /api/checkout/stripe/verify
 * ตรวจสอบสถานะการชำระเงินของ Stripe PaymentIntent จาก Stripe API โดยตรง
 * ใช้เป็นแผนสำรอง (Fallback) เมื่อ Webhook ล่าช้าหรือมีปัญหา
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { requireUserAuth } from '@/lib/adminAuth'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rateLimit'
import { OrderService } from '@/core/services/OrderService'
import { z } from 'zod'

const VerifySchema = z.object({
  orderId: z.number().int().positive(),
  paymentId: z.number().int().positive(),
})

export async function POST(request: NextRequest) {
  try {
    // 1. Rate Limiting ป้องกันการยิงเช็คยอดเงินถี่เกินไป (จำกัด 5 ครั้งต่อนาทีต่อ IP)
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const rateLimitResult = await rateLimit(`stripe-verify:${ip}`, {
      limit: 5,
      windowMs: 60000,
    })

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'ส่งคำขอตรวจสอบถี่เกินไป กรุณารอสักครู่' },
        { status: 429 }
      )
    }

    const json = await request.json()
    const validation = VerifySchema.safeParse(json)
    if (!validation.success) {
      return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
    }

    const { orderId, paymentId } = validation.data

    // 2. ดึงข้อมูล Order พร้อม Payment ที่เกี่ยวข้อง
    const order = await prisma.order.findUnique({
      where: { orderId },
      include: { payment: true }
    })

    if (!order) {
      return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 })
    }

    // 3. ตรวจสิทธิ์ — ต้องเป็นเจ้าของออเดอร์เท่านั้น
    const authError = await requireUserAuth(request, order.minecraftName)
    if (authError) {
      logger.security.accessDenied(`Order ${orderId}`, 'Stripe verification without ownership')
      return authError
    }

    // หากคำสั่งซื้อทำรายการเสร็จสมบูรณ์ไปแล้ว
    if (order.status === 'COMPLETED') {
      return NextResponse.json({
        success: true,
        message: 'คำสั่งซื้อได้รับการชำระเงินเรียบร้อยแล้ว',
        status: 'COMPLETED',
      })
    }

    const payment = order.payment
    if (!payment || payment.paymentId !== paymentId) {
      return NextResponse.json({ error: 'ข้อมูลการชำระเงินไม่สอดคล้องกับระบบ' }, { status: 400 })
    }

    // ถ้า Payment ถูกปรับสถานะเป็นสำเร็จไปแล้วแต่ออเดอร์ยังค้างอยู่ ให้เปลี่ยนสถานะให้ตรงกัน
    if (payment.status === 'VERIFIED') {
      await prisma.order.update({
        where: { orderId },
        data: { status: 'COMPLETED' }
      })
      return NextResponse.json({
        success: true,
        message: 'คำสั่งซื้อได้รับการชำระเงินเรียบร้อยแล้ว',
        status: 'COMPLETED',
      })
    }

    const paymentIntentId = payment.stripePaymentIntentId
    if (!paymentIntentId) {
      return NextResponse.json({ error: 'ไม่พบรหัสธุรกรรม Stripe ในระบบร้านค้า' }, { status: 400 })
    }

    // 4. ดึงข้อมูลสถานะจาก Stripe API โดยตรงเพื่อตรวจสอบ
    const stripe = getStripe()
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (paymentIntent.status === 'succeeded') {
      // ตรวจพบว่ายอดเงินเข้า Stripe จริง แต่หลังบ้านเรายังไม่ได้บันทึก
      // เรียก completeOrder ทำรายการเสร็จสมบูรณ์ทันที
      await OrderService.completeOrder(
        orderId,
        paymentId,
        'stripe',
        paymentIntentId
      )

      logger.info(`Stripe payment manually verified and completed: Order #${orderId}, Intent: ${paymentIntentId}`, 200)

      return NextResponse.json({
        success: true,
        message: 'ตรวจสอบพบยอดชำระเงินสำเร็จ! กำลังจัดส่งสินค้า/เหรียญ',
        status: 'COMPLETED',
      })
    } else {
      // กรณีสถานะยังไม่สำเร็จบน Stripe
      let statusMessage = 'ยังไม่พบยอดชำระเงินบนระบบ Stripe'
      if (paymentIntent.status === 'requires_action') {
        statusMessage = 'กรุณาสแกนจ่ายเงินเพื่อทำรายการชำระเงินต่อ'
      } else if (paymentIntent.status === 'canceled') {
        statusMessage = 'รายการชำระเงินนี้ถูกยกเลิกแล้ว'
      } else if (paymentIntent.status === 'processing') {
        statusMessage = 'ระบบชำระเงินกำลังประมวลผล กรุณารอสักครู่แล้วตรวจสอบอีกครั้ง'
      }

      return NextResponse.json({
        success: false,
        message: statusMessage,
        stripeStatus: paymentIntent.status,
      })
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Stripe manual verification error: ${errorMessage}`)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการเชื่อมต่อตรวจสอบยอดเงิน' }, { status: 500 })
  }
}
