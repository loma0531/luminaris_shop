/**
 * OrderService
 * จัดการ Business Logic ของ Order ทั้งหมด
 * สร้าง Order, เปลี่ยนสถานะ, คำนวณราคา, อัปเดตสถิติ
 * 
 * ย้ายมาจาก: POST method ใน api/orders/checkout/route.ts
 */

import prisma from '@/lib/prisma'
import { getNextSequence } from '@/lib/counter'
import { logger, createTimer } from '@/lib/logger'
import { FulfillmentService, type OrderItemForDelivery } from './FulfillmentService'
import { sendPurchaseLog } from '@/lib/webhook'
import { invalidateStatsCache } from '@/lib/redis'

export interface CreateOrderInput {
  minecraftName: string
  items: {
    productId: string
    name: string
    price: number
    quantity: number
    commands: string[]
    customInput?: string | null
  }[]
  total: number
}

export interface OrderResult {
  success: boolean
  orderId: number
  paymentId: number
  paymentObjectId: string
  orderObjectId: string
  createdAt: Date
}

export class OrderService {
  /**
   * สร้าง Order ใหม่ (สถานะ AWAITING_PAYMENT)
   */
  static async createOrder(input: CreateOrderInput): Promise<OrderResult> {
    const timer = createTimer()
    const { minecraftName, items, total } = input

    // Security: Fetch products from database to prevent price manipulation and command injection
    const productIds = items.map(item => item.productId)
    const dbProducts = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      },
    })

    const productMap = new Map(dbProducts.map((p) => [p.id, p]))

    const sanitizedItems = []
    let calculatedTotal = 0

    for (const item of items) {
      const dbProduct = productMap.get(item.productId)
      if (!dbProduct) {
        logger.security.suspiciousActivity(`Product not found or inactive during OrderService create: ${item.productId}`, minecraftName)
        throw new Error('สินค้าไม่ถูกต้องหรือถูกปิดใช้งานแล้ว')
      }

      // Overwrite name, price, and commands with values from the database
      const verifiedItem = {
        productId: dbProduct.id,
        name: dbProduct.name,
        price: dbProduct.price,
        quantity: item.quantity,
        commands: dbProduct.commands, // CRITICAL: Server-controlled commands!
        customInput: item.customInput || null,
      }

      sanitizedItems.push(verifiedItem)
      calculatedTotal += verifiedItem.price * verifiedItem.quantity
    }

    if (Math.abs(calculatedTotal - total) > 1) {
      logger.security.priceManipulation(total, calculatedTotal, minecraftName)
      throw new Error('Total amount mismatch')
    }

    // สร้าง sequential IDs
    const paymentSeqId = await getNextSequence('payment_id')
    const orderSeqId = await getNextSequence('order_id')

    // สร้าง Payment + Order
    const payment = await prisma.payment.create({
      data: {
        paymentId: paymentSeqId,
        minecraftName,
        amount: calculatedTotal,
        status: 'PENDING',
      },
    })

    const order = await prisma.order.create({
      data: {
        orderId: orderSeqId,
        minecraftName,
        total: calculatedTotal,
        status: 'AWAITING_PAYMENT',
        paymentId: payment.id,
        items: sanitizedItems,
      },
    })

    logger.order.created(
      orderSeqId,
      minecraftName,
      calculatedTotal,
      items.length,
      timer()
    )

    for (const item of items) {
      logger.order.itemDetail(item.name, item.quantity, item.price)
    }

    logger.payment.created(paymentSeqId, minecraftName, calculatedTotal)

    return {
      success: true,
      orderId: order.orderId,
      paymentId: payment.paymentId,
      paymentObjectId: payment.id,
      orderObjectId: order.id,
      createdAt: order.createdAt,
    }
  }

  /**
   * Complete order หลังจากจ่ายเงินสำเร็จ
   * อัปเดตสถานะ Payment + Order + User totalSpent + soldCount
   * แล้วเรียก FulfillmentService ส่งของ
   */
  static async completeOrder(
    orderId: number,
    paymentId: number,
    paymentMethod: string,
    paymentRef?: string
  ): Promise<{
    orderCompleted: boolean
    fulfillment: Awaited<ReturnType<typeof FulfillmentService.fulfillOrder>>
  }> {
    const timer = createTimer()

    // ดึง Order
    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) throw new Error(`Order #${orderId} not found`)

    // ดึง Payment
    const payment = await prisma.payment.findUnique({ where: { paymentId } })
    if (!payment) throw new Error(`Payment #${paymentId} not found`)

    // Idempotency: ถ้า order เสร็จแล้ว ไม่ทำซ้ำ
    if (order.status === 'COMPLETED') {
      logger.warn(
        `Order #${orderId} already completed, skipping duplicate`,
        200
      )
      return {
        orderCompleted: true,
        fulfillment: {
          success: true,
          totalCommands: 0,
          successCount: 0,
          failCount: 0,
          status: 'SUCCESS',
          message: 'Order already completed',
        },
      }
    }

    // C4 Fix: ใช้ Interactive Transaction (async callback form) แทน static array
    // เพื่อให้ atomic จริงใน MongoDB multi-document operations
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { paymentId },
        data: {
          status: 'VERIFIED',
          paymentMethod,
          stripePaymentIntentId: paymentRef || null,
          verifiedAt: new Date(),
        },
      })
      await tx.order.update({
        where: { orderId },
        data: { status: 'COMPLETED' },
      })
      // ค้นหาผู้เล่นแบบ Case-Insensitive ในฐานข้อมูลร้านค้าก่อน
      const existingUser = await tx.user.findFirst({
        where: {
          minecraftName: {
            equals: order.minecraftName,
            mode: 'insensitive'
          }
        }
      })

      const targetMinecraftName = existingUser ? existingUser.minecraftName : order.minecraftName

      if (order.isTopUp) {
        if (existingUser) {
          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              totalSpent: { increment: order.total },
              coins: { increment: payment.coinsEarned || 0.0 }
            }
          })
        } else {
          await tx.user.create({
            data: {
              minecraftName: targetMinecraftName,
              totalSpent: order.total,
              coins: payment.coinsEarned || 0.0
            }
          })
        }

        await tx.coinTransaction.create({
          data: {
            minecraftName: targetMinecraftName,
            amount: payment.coinsEarned || 0.0,
            type: 'TOPUP',
            description: `เติมเงินสะสมเหรียญด้วย Order #${orderId} ผ่านช่องทาง ${paymentMethod}`,
          }
        })
      } else {
        const isCoinPayment = paymentMethod === 'coin'
        if (existingUser) {
          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              totalSpent: isCoinPayment ? undefined : { increment: order.total }
            }
          })
        } else {
          await tx.user.create({
            data: {
              minecraftName: targetMinecraftName,
              totalSpent: isCoinPayment ? 0.0 : order.total,
              coins: 0.0
            }
          })
        }
      }
    })

    logger.payment.statusChanged(paymentId, 'PENDING', 'VERIFIED')
    logger.order.statusChanged(
      orderId,
      'AWAITING_PAYMENT',
      'COMPLETED',
      order.minecraftName
    )
    logger.order.completed(
      orderId,
      order.minecraftName,
      order.total,
      timer()
    )

    // อัปเดต soldCount (ไม่ critical — ถ้า fail ก็ไม่เป็นไร)
    try {
      if (!order.isTopUp) {
        await prisma.$transaction(
          (order.items as { productId: string; quantity: number }[]).map(
            (item) =>
              prisma.product.update({
                where: { id: item.productId },
                data: { soldCount: { increment: item.quantity } },
              })
          )
        )
      }
    } catch {
      logger.warn('Failed to update some product sold counts', 500)
    }

    // ส่ง Discord notification
    const orderItems = (
      order.items as { name: string; quantity: number; price: number }[]
    ).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    }))

    sendPurchaseLog({
      orderId,
      minecraftName: order.minecraftName,
      amount: order.total,
      items: orderItems,
      transRef: paymentRef,
      status: 'SUCCESS',
      paymentMethod: paymentMethod as 'truewallet',
    }).catch(() => {})

    invalidateStatsCache().catch(() => {})

    if (order.isTopUp) {
      return {
        orderCompleted: true,
        fulfillment: {
          success: true,
          totalCommands: 0,
          successCount: 0,
          failCount: 0,
          status: 'SUCCESS',
          message: 'Top-up coin completed successfully',
        }
      }
    }

    // ส่งของผ่าน RCON
    const fulfillment = await FulfillmentService.fulfillOrder(
      orderId,
      order.id,
      order.minecraftName,
      order.items as OrderItemForDelivery[]
    )

    return { orderCompleted: true, fulfillment }
  }

  /**
   * ยกเลิก Order
   */
  static async cancelOrder(orderId: number): Promise<void> {
    const order = await prisma.order.findUnique({ 
      where: { orderId },
      include: { payment: true }
    })
    if (!order) throw new Error(`Order #${orderId} not found`)

    // หากมีการจ่ายผ่าน Stripe และมี PaymentIntent ให้สั่งยกเลิกบน Stripe
    if (order.payment?.paymentMethod === 'stripe' && order.payment.stripePaymentIntentId) {
      try {
        const { getStripe } = await import('@/lib/stripe')
        const stripe = getStripe()
        await stripe.paymentIntents.cancel(order.payment.stripePaymentIntentId)
        logger.info(
          `Stripe PaymentIntent ${order.payment.stripePaymentIntentId} cancelled successfully for order #${orderId}`,
          200
        )
      } catch (stripeError) {
        // Log ข้อผิดพลาด แต่ไม่อนุญาตให้ขัดขวางกระบวนการยกเลิกในฐานข้อมูลหลัก
        const errMsg = stripeError instanceof Error ? stripeError.message : String(stripeError)
        logger.error(`Failed to cancel Stripe PaymentIntent ${order.payment.stripePaymentIntentId}: ${errMsg}`)
      }
    }

    // C4 Fix: ใช้ Interactive Transaction form
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { orderId },
        data: { status: 'CANCELLED' },
      })
      await tx.payment.updateMany({
        where: { id: order.paymentId || undefined },
        data: { status: 'REJECTED' },
      })
    })

    logger.order.statusChanged(
      orderId,
      order.status,
      'CANCELLED',
      order.minecraftName
    )
  }
}
