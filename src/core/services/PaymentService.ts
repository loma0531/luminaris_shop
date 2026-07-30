/**
 * PaymentService
 * จัดการ Business Logic เกี่ยวกับการจ่ายเงินทั้งหมด
 * Stripe checkout, Stripe webhook, TrueWallet
 */

import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { OrderService } from './OrderService'

export interface StripeSessionResult {
  clientSecret: string
  paymentIntentId: string
}

export class PaymentService {
  /**
   * สร้าง Stripe Payment Intent สำหรับ Order
   */
  static async createStripePaymentIntent(
    orderId: number,
    paymentId: number
  ): Promise<StripeSessionResult> {
    // ดึง Order + Payment
    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) throw new Error(`Order #${orderId} not found`)
    if (order.status !== 'AWAITING_PAYMENT') {
      throw new Error('Order is not awaiting payment')
    }

    const payment = await prisma.payment.findUnique({ where: { paymentId } })
    if (!payment) throw new Error(`Payment #${paymentId} not found`)
    if (payment.status !== 'PENDING') {
      throw new Error('Payment already processed')
    }

    // ใช้ Stripe singleton
    const { getStripe } = await import('@/lib/stripe')
    const stripe = getStripe()

    // สร้าง Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(order.total * 100), // THB → สตางค์
      currency: 'thb',
      payment_method_types: ['card', 'promptpay'],
      metadata: {
        orderId: String(orderId),
        paymentId: String(paymentId),
        minecraftName: order.minecraftName,
      },
    })

    // บันทึก Stripe session ID ลง Payment
    await prisma.payment.update({
      where: { paymentId },
      data: {
        stripePaymentIntentId: paymentIntent.id,
        paymentMethod: 'stripe',
      },
    })

    logger.info(
      `Stripe PaymentIntent created: ${paymentIntent.id} for order #${orderId}`,
      200
    )

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
    }
  }

  /**
   * จัดการ Stripe Webhook Event
   * เรียก OrderService.completeOrder() เมื่อจ่ายเงินสำเร็จ
   */
  static async handleStripeWebhook(event: {
    type: string
    data: { object: { id: string; metadata: Record<string, string>; status: string } }
  }): Promise<void> {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object
        const paymentId = Number(paymentIntent.metadata.paymentId)
        const orderId = Number(paymentIntent.metadata.orderId)

        if (!orderId || !paymentId) {
          logger.error(
            `Stripe webhook missing metadata: ${JSON.stringify(paymentIntent.metadata)}`,
            400
          )
          return
        }

        logger.info(
          `Stripe payment succeeded: ${paymentIntent.id} → Order #${orderId} (isTopUp: ${paymentIntent.metadata.isTopUp})`,
          200
        )

        // เรียก OrderService จัดการต่อ (อัปเดตสถานะ + ส่งของ หรือเพิ่ม Coin)
        await OrderService.completeOrder(
          orderId,
          paymentId,
          'stripe',
          paymentIntent.id
        )
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object
        const orderId = paymentIntent.metadata.orderId

        logger.warn(
          `Stripe payment failed: ${paymentIntent.id} for order #${orderId}`,
          400
        )
        // ไม่เปลี่ยนสถานะ Order — ให้ผู้ใช้ลองใหม่ได้
        break
      }

      default:
        logger.debug(`Unhandled Stripe event: ${event.type}`, 200)
    }
  }
}
