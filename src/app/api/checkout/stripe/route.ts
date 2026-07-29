/**
 * POST /api/checkout/stripe
 * สร้าง Stripe PaymentIntent สำหรับ Order ที่รอชำระเงิน
 * 
 * Frontend จะได้ clientSecret ไปใช้กับ Stripe Payment Element
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { requireUserAuth } from '@/lib/adminAuth'
import { logger, createTimer } from '@/lib/logger'
import { rateLimit } from '@/lib/rateLimit'
import { z } from 'zod'

// Zod Schema สำหรับ request body
const CheckoutSchema = z.object({
  orderId: z.number().int().positive('Invalid order ID'),
  paymentId: z.number().int().positive('Invalid payment ID'),
})

export async function POST(request: NextRequest) {
  const timer = createTimer()

  try {
    // 0. Check if Stripe (Credit Card) is enabled
    const { getShopConfig } = await import('@/lib/config')
    const config = getShopConfig()
    if (!config.orders.payments.creditCard?.enabled) {
      return NextResponse.json(
        { error: 'ช่องทางการชำระเงินด้วยบัตรเครดิต/เดบิต ถูกปิดใช้งานชั่วคราว' },
        { status: 400 }
      )
    }

    // 1. Rate Limiting (5 requests per minute per IP/Session)
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const rateLimitResult = await rateLimit(`stripe-checkout:${ip}`, {
      limit: 5,
      windowMs: 60000,
    })
    
    if (!rateLimitResult.success) {
      logger.security.rateLimitExceeded(`stripe-checkout: ${ip}`)
      return NextResponse.json(
        { error: 'ส่งคำขอมากเกินไป กรุณารอสักครู่' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

    const json = await request.json()

    // Validate input
    const validation = CheckoutSchema.safeParse(json)
    if (!validation.success) {
      const errorMsg = validation.error.issues
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ')
      return NextResponse.json(
        { error: `Validation error: ${errorMsg}` },
        { status: 400 }
      )
    }

    const { orderId, paymentId } = validation.data

    // ดึง Order
    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) {
      return NextResponse.json(
        { error: 'ไม่พบคำสั่งซื้อ' },
        { status: 404 }
      )
    }

    // ตรวจสิทธิ์ — ต้องเป็นเจ้าของ Order
    const authError = await requireUserAuth(request, order.minecraftName)
    if (authError) {
      logger.security.accessDenied(
        `Order ${orderId}`,
        'Stripe checkout without ownership'
      )
      return authError
    }

    // ตรวจสถานะ
    if (order.status !== 'AWAITING_PAYMENT') {
      return NextResponse.json(
        { error: 'คำสั่งซื้อนี้ไม่อยู่ในสถานะรอชำระเงิน' },
        { status: 400 }
      )
    }

    // ดึง Payment
    const payment = await prisma.payment.findUnique({ where: { paymentId } })
    if (!payment) {
      return NextResponse.json(
        { error: 'ไม่พบรายการชำระเงิน' },
        { status: 404 }
      )
    }

    if (payment.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'รายการนี้ถูกดำเนินการไปแล้ว' },
        { status: 400 }
      )
    }

    // ถ้ามี PaymentIntent อยู่แล้ว ให้ reuse
    if (payment.stripePaymentIntentId && payment.paymentMethod === 'stripe') {
      try {
        const stripe = getStripe()
        const existingIntent = await stripe.paymentIntents.retrieve(
          payment.stripePaymentIntentId
        )

        // ถ้ายังใช้ได้ อัพเดต payment_method_types เป็น card only แล้วส่ง clientSecret กลับ
        if (
          existingIntent.status === 'requires_payment_method' ||
          existingIntent.status === 'requires_confirmation' ||
          existingIntent.status === 'requires_action'
        ) {
          // บังคับ card only (PromptPay แยก endpoint แล้ว)
          await stripe.paymentIntents.update(existingIntent.id, {
            payment_method_types: ['card'],
          })

          logger.info(
            `Reusing existing PaymentIntent ${existingIntent.id} for order #${orderId}`,
            200,
            timer()
          )
          return NextResponse.json({
            clientSecret: existingIntent.client_secret,
            paymentIntentId: existingIntent.id,
            amount: order.total,
            currency: 'thb',
          })
        }
      } catch {
        // PaymentIntent เก่าใช้ไม่ได้ → สร้างใหม่
      }
    }

    // สร้าง Stripe PaymentIntent ใหม่
    const stripe = getStripe()
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(order.total * 100), // THB → สตางค์
      currency: 'thb',
      payment_method_types: ['card'],
      metadata: {
        orderId: String(orderId),
        paymentId: String(paymentId),
        minecraftName: order.minecraftName,
        isTopUp: String(order.isTopUp),
      },
      description: `Luminaris Shop - Order #${orderId}`,
    })

    // บันทึก PaymentIntent ID ลง Payment record
    await prisma.payment.update({
      where: { paymentId },
      data: {
        stripePaymentIntentId: paymentIntent.id,
        paymentMethod: 'stripe',
      },
    })

    logger.info(
      `Stripe PaymentIntent created: ${paymentIntent.id} for order #${orderId} (${order.total}฿)`,
      200,
      timer()
    )

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: order.total,
      currency: 'thb',
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    logger.system.error(`Stripe checkout failed: ${errorMessage}`)
    return NextResponse.json(
      { error: 'ไม่สามารถสร้างรายการชำระเงินได้' },
      { status: 500 }
    )
  }
}
