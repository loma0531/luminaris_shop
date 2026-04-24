/**
 * FulfillmentService
 * จัดการการส่งไอเทมให้ผู้เล่นผ่าน RCON
 * รวบรวม commands, ส่งผ่าน RCON, จัดการ retry queue
 * 
 * ย้ายมาจาก: PUT method ใน api/orders/checkout/route.ts
 */

import prisma from '@/lib/prisma'
import { giveItemsToPlayer } from '@/lib/rcon'
import { replaceCustomInput } from '@/lib/inputValidation'
import { logger } from '@/lib/logger'

export interface OrderItemForDelivery {
  productId: string
  name: string
  price: number
  quantity: number
  commands: string[]
  customInput?: string | null
}

export interface FulfillmentResult {
  success: boolean
  totalCommands: number
  successCount: number
  failCount: number
  status: 'SUCCESS' | 'FAILED' | 'QUEUED' | 'NO_COMMANDS'
  message: string
}

export class FulfillmentService {
  /**
   * ส่งไอเทมทั้งหมดใน Order ให้ผู้เล่น
   * ถ้าส่งไม่สำเร็จจะเก็บเข้า CommandQueue สำหรับ retry
   */
  static async fulfillOrder(
    orderId: number,
    orderObjectId: string,
    minecraftName: string,
    items: OrderItemForDelivery[]
  ): Promise<FulfillmentResult> {
    // กรองเฉพาะ items ที่มี commands
    const itemsWithCommands = items.filter(
      (item) => item.commands && item.commands.length > 0
    )

    // ถ้าไม่มี commands ให้ mark delivered ทันที
    if (itemsWithCommands.length === 0) {
      await prisma.order.update({
        where: { orderId },
        data: { isDelivered: true },
      })
      return {
        success: true,
        totalCommands: 0,
        successCount: 0,
        failCount: 0,
        status: 'NO_COMMANDS',
        message: 'No commands to execute',
      }
    }

    // รวบรวม commands ทั้งหมดเป็น list เดียว
    const allCommands = this.collectCommands(itemsWithCommands)

    logger.rcon.deliveryStarted(orderId, minecraftName, itemsWithCommands.length)
    logger.info(
      `Batch executing ${allCommands.length} commands for order #${orderId}...`,
      200
    )

    try {
      const result = await giveItemsToPlayer(minecraftName, allCommands)

      if (result.success) {
        // ส่งสำเร็จทั้งหมด
        await prisma.order.update({
          where: { orderId },
          data: { isDelivered: true },
        })

        logger.rcon.deliveryCompleted(orderId, minecraftName, allCommands.length, 0)

        return {
          success: true,
          totalCommands: allCommands.length,
          successCount: allCommands.length,
          failCount: 0,
          status: 'SUCCESS',
          message: 'ส่งไอเทมเรียบร้อยแล้ว',
        }
      } else {
        // ส่งไม่สำเร็จ → เก็บเข้า queue
        await this.queueCommands(
          allCommands,
          minecraftName,
          orderObjectId,
          result.results.join('; ').substring(0, 500)
        )

        await prisma.order.update({
          where: { orderId },
          data: { deliveryAttempts: { increment: 1 } },
        })

        logger.rcon.failed(
          minecraftName,
          `Batch RCON failed: ${result.results.join('; ')}`
        )

        return {
          success: false,
          totalCommands: allCommands.length,
          successCount: 0,
          failCount: allCommands.length,
          status: 'QUEUED',
          message: 'ไอเทมจะถูกส่งเมื่อคุณออนไลน์',
        }
      }
    } catch (e) {
      // Error ร้ายแรง → เก็บเข้า queue
      const err = e instanceof Error ? e.message : String(e)
      logger.rcon.failed(minecraftName, `Critical Batch Error: ${err}`)

      await this.queueCommands(
        allCommands,
        minecraftName,
        orderObjectId,
        err.substring(0, 500)
      )

      await prisma.order.update({
        where: { orderId },
        data: { deliveryAttempts: { increment: 1 } },
      })

      return {
        success: false,
        totalCommands: allCommands.length,
        successCount: 0,
        failCount: allCommands.length,
        status: 'FAILED',
        message: 'การส่งไอเทมล้มเหลว กรุณาติดต่อแอดมิน',
      }
    }
  }

  /**
   * Retry ส่ง commands ที่ค้างอยู่ใน queue
   */
  static async retryFailedDeliveries(orderId: string): Promise<void> {
    const pendingCommands = await prisma.commandQueue.findMany({
      where: { orderId, status: 'PENDING' },
    })

    if (pendingCommands.length === 0) return

    const minecraftName = pendingCommands[0].minecraftName
    const commands = pendingCommands.map((cmd) => cmd.command)

    logger.info(
      `Retrying ${commands.length} commands for ${minecraftName}...`,
      200
    )

    try {
      const result = await giveItemsToPlayer(minecraftName, commands)

      if (result.success) {
        await prisma.commandQueue.updateMany({
          where: { orderId, status: 'PENDING' },
          data: { status: 'COMPLETED' },
        })

        // หา order จริงแล้ว mark delivered
        const order = await prisma.order.findFirst({
          where: { id: orderId },
        })
        if (order) {
          await prisma.order.update({
            where: { id: orderId },
            data: { isDelivered: true },
          })
        }

        logger.info(`Retry successful for ${minecraftName}`, 200)
      } else {
        // เพิ่ม retry count
        await prisma.commandQueue.updateMany({
          where: { orderId, status: 'PENDING' },
          data: {
            lastError: result.results.join('; ').substring(0, 500),
          },
        })
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      logger.error(`Retry failed for ${minecraftName}: ${err}`, 500)
    }
  }

  /**
   * รวบรวม commands จาก items ทั้งหมด
   * แทนที่ {customInput} ด้วยค่าจริง
   */
  private static collectCommands(items: OrderItemForDelivery[]): string[] {
    const commands: string[] = []

    for (const item of items) {
      for (let i = 0; i < item.quantity; i++) {
        for (const cmd of item.commands) {
          const processedCmd = item.customInput
            ? replaceCustomInput(cmd, item.customInput)
            : cmd
          commands.push(processedCmd)
        }
      }
    }

    return commands
  }

  /**
   * เก็บ commands เข้า CommandQueue สำหรับ retry ภายหลัง
   */
  private static async queueCommands(
    commands: string[],
    minecraftName: string,
    orderObjectId: string,
    lastError: string
  ): Promise<void> {
    await Promise.all(
      commands.map((cmd) =>
        prisma.commandQueue.create({
          data: {
            command: cmd,
            minecraftName,
            orderId: orderObjectId,
            status: 'PENDING',
            lastError,
          },
        })
      )
    )
  }
}
