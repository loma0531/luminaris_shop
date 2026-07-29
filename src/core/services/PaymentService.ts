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
   * เรียก OrderService.completeOrder() เมื่อจ่ายเงินสำเร็จ หรือ completeTopUp() ถ้าเป็นการเติม Coin
   */
  static async handleStripeWebhook(event: {
    type: string
    data: { object: { id: string; metadata: Record<string, string>; status: string } }
  }): Promise<void> {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object
        const paymentId = Number(paymentIntent.metadata.paymentId)
        const isTopUp = paymentIntent.metadata.isTopUp === 'true'

        if (isTopUp) {
          if (!paymentId) {
            logger.error(`Stripe webhook top-up missing paymentId metadata`, 400)
            return
          }
          await PaymentService.completeTopUp(paymentId, paymentIntent.id)
          break
        }

        const orderId = Number(paymentIntent.metadata.orderId)
        if (!orderId || !paymentId) {
          logger.error(
            `Stripe webhook missing metadata: ${JSON.stringify(paymentIntent.metadata)}`,
            400
          )
          return
        }

        logger.info(
          `Stripe payment succeeded: ${paymentIntent.id} → Order #${orderId}`,
          200
        )

        // เรียก OrderService จัดการต่อ (อัปเดตสถานะ + ส่งของ)
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

  /**
   * ยืนยันการเติมเงินสะสม Coin สำเร็จ (Stripe)
   */
  static async completeTopUp(
    paymentId: number,
    paymentRef: string
  ): Promise<void> {
    const payment = await prisma.payment.findUnique({ where: { paymentId } })
    if (!payment) throw new Error(`Payment #${paymentId} not found`)
    if (payment.status === 'VERIFIED') return // Idempotency

    const coinsEarned = payment.coinsEarned || 0.0

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { paymentId },
        data: {
          status: 'VERIFIED',
          paymentMethod: 'stripe',
          stripePaymentIntentId: paymentRef,
          verifiedAt: new Date(),
        },
      })
      await tx.user.upsert({
        where: { minecraftName: payment.minecraftName },
        update: { coins: { increment: coinsEarned } },
        create: {
          minecraftName: payment.minecraftName,
          coins: coinsEarned,
        },
      })
      await tx.coinTransaction.create({
        data: {
          minecraftName: payment.minecraftName,
          amount: coinsEarned,
          type: 'TOPUP',
          description: `เติมเงินผ่าน Stripe ${payment.amount} บาท รับ ${coinsEarned} Coin`,
        },
      })
    })

    logger.info(`Stripe TopUp completed: ${paymentRef} for ${payment.minecraftName} (${payment.amount}฿ → ${coinsEarned} Coins)`)
    
    // ส่ง Log ไป Discord
    const { sendPurchaseLog } = await import('@/lib/webhook')
    sendPurchaseLog({
      orderId: 0,
      minecraftName: payment.minecraftName,
      amount: payment.amount,
      items: [{ name: `เติมเงินสะสม Coin (ได้รับ ${coinsEarned} Coin)`, quantity: 1, price: payment.amount }],
      transRef: paymentRef,
      status: 'SUCCESS',
      paymentMethod: 'stripe' as any,
    }).catch(() => {})
  }
}
