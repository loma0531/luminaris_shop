import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { giveItemsToPlayer } from '@/lib/rcon'
import { logger } from '@/lib/logger'

/**
 * Check if all commands for an order are completed and update Order.isDelivered
 */
async function syncOrderDeliveryStatus(orderId: string): Promise<void> {
  try {
    // Count remaining pending/failed commands for this order
    const pendingCount = await prisma.commandQueue.count({
      where: {
        orderId,
        status: { in: ['PENDING', 'PROCESSING', 'FAILED'] }
      }
    })

    // If no pending commands remain, mark the order as delivered
    if (pendingCount === 0) {
      await prisma.order.update({
        where: { id: orderId },
        data: { isDelivered: true }
      })
      logger.info(`Order ${orderId} marked as delivered - all commands completed`, 200)
    }
  } catch {
    logger.warn(`Failed to sync delivery status for order ${orderId}`, 500)
  }
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    // 1. Fetch pending commands
    const pendingCommands = await prisma.commandQueue.findMany({
      where: { 
        status: { in: ['PENDING', 'FAILED'] },
        retryCount: { lt: 5 }
      },
      take: 20 // Process in batches
    })

    if (pendingCommands.length === 0) {
      return NextResponse.json({ message: 'No pending commands to retry' })
    }

    logger.info(`Retrying ${pendingCommands.length} failed commands`, 200)

    const results = []
    const ordersToSync = new Set<string>()

    for (const cmdEntry of pendingCommands) {
      // Mark as processing
      await prisma.commandQueue.update({
        where: { id: cmdEntry.id },
        data: { status: 'PROCESSING' }
      })

      try {
        const result = await giveItemsToPlayer(cmdEntry.minecraftName, [cmdEntry.command])
        
        if (result.success) {
          await prisma.commandQueue.update({
            where: { id: cmdEntry.id },
            data: { status: 'COMPLETED' }
          })
          results.push({ id: cmdEntry.id, status: 'COMPLETED' })
          logger.rcon.itemDelivered(cmdEntry.minecraftName, 'Retry Command', 1)
          
          // Track this order for status sync
          ordersToSync.add(cmdEntry.orderId)
        } else {
          await prisma.commandQueue.update({
            where: { id: cmdEntry.id },
            data: { 
              status: 'FAILED',
              retryCount: { increment: 1 },
              lastError: result.results.join('; ')
            }
          })
          results.push({ id: cmdEntry.id, status: 'FAILED' })
        }
      } catch (error) {
         await prisma.commandQueue.update({
            where: { id: cmdEntry.id },
            data: { 
              status: 'FAILED',
              retryCount: { increment: 1 },
              lastError: (error as Error).message
            }
          })
          results.push({ id: cmdEntry.id, status: 'FAILED' })
      }
    }

    // Sync delivery status for all affected orders
    for (const orderId of ordersToSync) {
      await syncOrderDeliveryStatus(orderId)
    }

    return NextResponse.json({ 
      success: true, 
      processed: results.length,
      results 
    })

  } catch {
    logger.system.error('Failed to retry commands')
    return NextResponse.json({ error: 'Retry failed' }, { status: 500 })
  }
}
