/**
 * POST /api/checkout/stripe/promptpay
 * Confirm PaymentIntent ด้วย PromptPay แล้ว return QR Code URL
 * ใช้สำหรับ custom PromptPay UI (ไม่ผ่าน Stripe PaymentElement)
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { requireUserAuth } from '@/lib/adminAuth'
import { logger, createTimer } from '@/lib/logger'
import { rateLimit } from '@/lib/rateLimit'
import { z } from 'zod'

const PromptPaySchema = z.object({
  orderId: z.number().int().positive(),
  paymentId: z.number().int().positive(),
})

export async function POST(request: NextRequest) {
  const timer = createTimer()

  try {
    // Rate Limiting
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const rateLimitResult = await rateLimit(`promptpay-checkout:${ip}`, {
      limit: 5,
      windowMs: 60000,
    })

    if (!rateLimitResult.success) {
      logger.security.rateLimitExceeded(`promptpay-checkout: ${ip}`)
      return NextResponse.json(
        { error: 'ส่งคำขอมากเกินไป กรุณารอสักครู่' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

    const json = await request.json()
    const validation = PromptPaySchema.safeParse(json)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ถูกต้อง' },
        { status: 400 }
      )
    }

    const { orderId, paymentId } = validation.data

    // ดึง Order
    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) {
      return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 })
    }

    // ตรวจสิทธิ์
    const authError = await requireUserAuth(request, order.minecraftName)
    if (authError) {
      logger.security.accessDenied(`Order ${orderId}`, 'PromptPay checkout without ownership')
      return authError
    }

    if (order.status !== 'AWAITING_PAYMENT') {
      return NextResponse.json(
        { error: 'คำสั่งซื้อนี้ไม่อยู่ในสถานะรอชำระเงิน' },
        { status: 400 }
      )
    }

    // ดึง Payment record
    const payment = await prisma.payment.findUnique({ where: { paymentId } })
    if (!payment) {
      return NextResponse.json({ error: 'ไม่พบรายการชำระเงิน' }, { status: 404 })
    }

    if (payment.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'รายการนี้ถูกดำเนินการไปแล้ว' },
        { status: 400 }
      )
    }

    const stripe = getStripe()
    let paymentIntentId = payment.stripePaymentIntentId
    let existingPI = null

    // ถ้ามี PaymentIntent ค้างในฐานข้อมูลแล้ว ให้พยายามดึงข้อมูลมาตรวจสอบ
    if (paymentIntentId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
        // หากธุรกรรมอยู่ในสถานะที่ใช้งานต่อได้ ให้ใช้ตัวเดิม
        if (pi.status !== 'canceled' && pi.status !== 'succeeded') {
          existingPI = pi
        } else {
          // หากถูกยกเลิกหรือสำเร็จไปแล้ว ให้เคลียร์ ID เพื่อสร้างใหม่
          paymentIntentId = null
        }
      } catch {
        // หากดึงข้อมูลล้มเหลว (เช่น ไม่มีคีย์นี้ใน Stripe) ให้สร้างใหม่
        paymentIntentId = null
      }
    }

    // ถ้าไม่มี PaymentIntent หรืออันเดิมใช้ไม่ได้ → สร้างใหม่เพียงครั้งเดียว
    if (!paymentIntentId) {
      const pi = await stripe.paymentIntents.create({
        amount: Math.round(order.total * 100),
        currency: 'thb',
        payment_method_types: ['promptpay'],
        metadata: {
          orderId: String(orderId),
          paymentId: String(paymentId),
          minecraftName: order.minecraftName,
          isTopUp: String(order.isTopUp),
        },
        description: `Luminaris Shop - Order #${orderId}`,
      })

      await prisma.payment.update({
        where: { paymentId },
        data: {
          stripePaymentIntentId: pi.id,
          paymentMethod: 'stripe',
        },
      })

      paymentIntentId = pi.id
      existingPI = pi
    }

    // ถ้ามี QR อยู่แล้ว (requires_action) → return QR เลย
    if (
      existingPI &&
      existingPI.status === 'requires_action' &&
      existingPI.next_action?.type === 'promptpay_display_qr_code'
    ) {
      const qrData = existingPI.next_action.promptpay_display_qr_code as {
        image_url_png?: string
        expires_at?: number
      }

      logger.info(
        `Reusing existing PromptPay QR for order #${orderId}`,
        200,
        timer()
      )

      return NextResponse.json({
        qrCodeUrl: qrData.image_url_png || null,
        expiresAt: qrData.expires_at || null,
        clientSecret: existingPI.client_secret,
      })
    }

    // ถ้ายังไม่ confirm → confirm ด้วย PromptPay
    if (
      existingPI &&
      (existingPI.status === 'requires_payment_method' ||
       existingPI.status === 'requires_confirmation')
    ) {
      // อัพเดต payment_method_types ให้รองรับ promptpay
      await stripe.paymentIntents.update(paymentIntentId, {
        payment_method_types: ['promptpay'],
      })

      const confirmedPI = await stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method_data: {
          type: 'promptpay',
          billing_details: {
            email: 'noreply@luminaris.shop',
          },
        },
        return_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/shop/orders`,
      })

      if (
        confirmedPI.status === 'requires_action' &&
        confirmedPI.next_action?.type === 'promptpay_display_qr_code'
      ) {
        const qrData = confirmedPI.next_action.promptpay_display_qr_code as {
          image_url_png?: string
          expires_at?: number
        }

        logger.info(
          `PromptPay QR created for order #${orderId} (${order.total}฿)`,
          200,
          timer()
        )

        return NextResponse.json({
          qrCodeUrl: qrData.image_url_png || null,
          expiresAt: qrData.expires_at || null,
          clientSecret: confirmedPI.client_secret,
        })
      }
    }

    return NextResponse.json(
      { error: 'ไม่สามารถสร้าง QR Code ได้ กรุณาลองใหม่' },
      { status: 400 }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`PromptPay checkout failed: ${errorMessage}`)
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการสร้าง QR Code' },
      { status: 500 }
    )
  }
}
