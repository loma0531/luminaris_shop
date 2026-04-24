/**
 * POST /api/webhooks/stripe
 * รับ Events จาก Stripe (เช่น payment_intent.succeeded)
 * 
 * ⚠️ สำคัญ: ต้องใช้ raw body สำหรับ signature verification
 * Next.js App Router ไม่ parse body ถ้าเราอ่าน raw text เอง
 */

import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { PaymentService } from '@/core/services/PaymentService'
import { logger, createTimer } from '@/lib/logger'

export async function POST(request: NextRequest) {
  const timer = createTimer()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    logger.security.suspiciousActivity('Stripe webhook without signature', 'unknown')
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret || webhookSecret === 'whsec_REPLACE_ME') {
    logger.system.error('STRIPE_WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  try {
    // อ่าน raw body สำหรับ signature verification
    const rawBody = await request.text()
    const stripe = getStripe()

    // Verify signature จาก Stripe
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)

    logger.info(`Stripe webhook received: ${event.type} (${event.id})`, 200)

    // ส่งต่อให้ PaymentService จัดการ
    await PaymentService.handleStripeWebhook(event as {
      type: string
      data: { object: { id: string; metadata: Record<string, string>; status: string } }
    })

    logger.info(`Stripe webhook processed: ${event.type}`, 200, timer())

    return NextResponse.json({ received: true })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Signature verification error
    if (errorMessage.includes('signature')) {
      logger.security.suspiciousActivity('Invalid Stripe webhook signature', errorMessage)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    logger.system.error(`Stripe webhook error: ${errorMessage}`)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
