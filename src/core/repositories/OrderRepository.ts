/**
 * Order Repository
 * จัดการข้อมูล Order ผ่าน MongoDB (เน้น consistency)
 */

import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type { OrderStatus } from '@prisma/client'

export class OrderRepository {
  /**
   * สร้าง Order ใหม่ (เขียน MongoDB ตรง — ต้องการ consistency)
   */
  static async createOrder(data: {
    orderId: number
    minecraftName: string
    total: number
    status?: OrderStatus
    paymentId: string
    items: {
      productId: string
      name: string
      price: number
      quantity: number
      commands: string[]
      customInput?: string | null
    }[]
  }) {
    const order = await prisma.order.create({
      data: {
        orderId: data.orderId,
        minecraftName: data.minecraftName,
        total: data.total,
        status: data.status || 'AWAITING_PAYMENT',
        paymentId: data.paymentId,
        items: data.items,
      },
    })
    logger.order.created(data.orderId, data.minecraftName, data.total, Array.isArray(data.items) ? data.items.length : 0)
    return order
  }

  /**
   * ดึง pending orders ของ user
   */
  static async getPendingOrders(minecraftName: string) {
    return prisma.order.findMany({
      where: {
        minecraftName,
        status: { in: ['PENDING', 'AWAITING_PAYMENT'] },
      },
      include: { payment: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * ดึง order by orderId
   */
  static async getByOrderId(orderId: number) {
    return prisma.order.findUnique({ where: { orderId } })
  }

  /**
   * ดึง order by id
   */
  static async getById(id: string) {
    return prisma.order.findUnique({ where: { id } })
  }

  /**
   * อัปเดตสถานะ Order
   */
  static async updateStatus(orderId: number, status: OrderStatus) {
    return prisma.order.update({
      where: { orderId },
      data: { status },
    })
  }

  /**
   * Mark order as delivered
   */
  static async markDelivered(orderId: number) {
    return prisma.order.update({
      where: { orderId },
      data: { isDelivered: true },
    })
  }

  /**
   * เพิ่ม delivery attempts
   */
  static async incrementDeliveryAttempts(orderId: number) {
    return prisma.order.update({
      where: { orderId },
      data: { deliveryAttempts: { increment: 1 } },
    })
  }
}
