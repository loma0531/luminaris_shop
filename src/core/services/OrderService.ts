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

    // Double check ราคาจากฝั่ง server
    const calculatedTotal = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    )

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
        items,
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

    // อัปเดตสถานะ Payment + Order + User atomically
    await prisma.$transaction([
      prisma.payment.update({
        where: { paymentId },
        data: {
          status: 'VERIFIED',
          paymentMethod,
          stripePaymentIntentId: paymentRef || null,
          verifiedAt: new Date(),
        },
      }),
      prisma.order.update({
        where: { orderId },
        data: { status: 'COMPLETED' },
      }),
      prisma.user.upsert({
        where: { minecraftName: order.minecraftName },
        update: { totalSpent: { increment: order.total } },
        create: {
          minecraftName: order.minecraftName,
          totalSpent: order.total,
        },
      }),
    ])

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
      await prisma.$transaction(
        (order.items as { productId: string; quantity: number }[]).map(
          (item) =>
            prisma.product.update({
              where: { id: item.productId },
              data: { soldCount: { increment: item.quantity } },
            })
        )
      )
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
    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) throw new Error(`Order #${orderId} not found`)

    await prisma.$transaction([
      prisma.order.update({
        where: { orderId },
        data: { status: 'CANCELLED' },
      }),
      prisma.payment.updateMany({
        where: { id: order.paymentId || undefined },
        data: { status: 'REJECTED' },
      }),
    ])

    logger.order.statusChanged(
      orderId,
      order.status,
      'CANCELLED',
      order.minecraftName
    )
  }
}
