/**
 * Command Queue Worker
 * ประมวลผล commands ที่รอดำเนินการ (สำหรับ retry failed RCON commands)
 */
import prisma from '@/lib/prisma'
import { giveItemsToPlayer } from '@/lib/rcon'
import { logger } from '@/lib/logger'

const BATCH_SIZE = 10
const MAX_RETRIES = 5

interface ProcessResult {
  processed: number
  succeeded: number
  failed: number
  skipped: number
}

/**
 * Process pending commands in the queue
 */
export async function processCommandQueue(): Promise<ProcessResult> {
  const result: ProcessResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0
  }

  try {
    // Fetch pending commands that haven't exceeded max retries
    const pendingCommands = await prisma.commandQueue.findMany({
      where: {
        status: 'PENDING',
        retryCount: { lt: MAX_RETRIES }
      },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' }
    })

    if (pendingCommands.length === 0) {
      logger.debug('Queue worker: No pending commands', 200)
      return result
    }

    logger.info(`Queue worker: Processing ${pendingCommands.length} commands`, 200)

    // Group commands by minecraftName for batch processing
    const commandsByPlayer = new Map<string, typeof pendingCommands>()
    for (const cmd of pendingCommands) {
      const existing = commandsByPlayer.get(cmd.minecraftName) || []
      existing.push(cmd)
      commandsByPlayer.set(cmd.minecraftName, existing)
    }

    // Process each player's commands
    for (const [playerName, commands] of commandsByPlayer) {
      // Mark as processing
      await prisma.commandQueue.updateMany({
        where: { id: { in: commands.map(c => c.id) } },
        data: { status: 'PROCESSING' }
      })

      try {
        const commandStrings = commands.map(c => c.command)
        const rconResult = await giveItemsToPlayer(playerName, commandStrings)

        if (rconResult.success) {
          // Mark all as completed
          await prisma.commandQueue.updateMany({
            where: { id: { in: commands.map(c => c.id) } },
            data: { status: 'COMPLETED' }
          })
          
          result.succeeded += commands.length
          logger.info(`Queue worker: Successfully delivered ${commands.length} commands to ${playerName}`, 200)
          
          // Update order delivery status if all commands for an order are complete
          const orderIds = [...new Set(commands.map(c => c.orderId))]
          for (const orderId of orderIds) {
            const remainingCommands = await prisma.commandQueue.count({
              where: {
                orderId,
                status: { not: 'COMPLETED' }
              }
            })
            
            if (remainingCommands === 0) {
              await prisma.order.update({
                where: { id: orderId },
                data: { isDelivered: true }
              })
            }
          }
        } else {
          // Mark as pending again with incremented retry count
          await prisma.commandQueue.updateMany({
            where: { id: { in: commands.map(c => c.id) } },
            data: { 
              status: 'PENDING',
              retryCount: { increment: 1 },
              lastError: rconResult.results.join('; ').substring(0, 500)
            }
          })
          
          result.failed += commands.length
          logger.warn(`Queue worker: Failed to deliver to ${playerName}, will retry`, 500)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        
        // Mark as failed if max retries exceeded
        for (const cmd of commands) {
          const newRetryCount = cmd.retryCount + 1
          
          if (newRetryCount >= MAX_RETRIES) {
            await prisma.commandQueue.update({
              where: { id: cmd.id },
              data: { 
                status: 'FAILED',
                retryCount: newRetryCount,
                lastError: errorMessage.substring(0, 500)
              }
            })
            result.failed++
          } else {
            await prisma.commandQueue.update({
              where: { id: cmd.id },
              data: { 
                status: 'PENDING',
                retryCount: newRetryCount,
                lastError: errorMessage.substring(0, 500)
              }
            })
            result.processed++
          }
        }
        
        logger.error(`Queue worker: Error processing commands for ${playerName}: ${errorMessage}`, 500)
      }

      result.processed += commands.length
    }

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Queue worker: Fatal error: ${errorMessage}`, 500)
    throw error
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const [pending, processing, completed, failed] = await Promise.all([
    prisma.commandQueue.count({ where: { status: 'PENDING' } }),
    prisma.commandQueue.count({ where: { status: 'PROCESSING' } }),
    prisma.commandQueue.count({ where: { status: 'COMPLETED' } }),
    prisma.commandQueue.count({ where: { status: 'FAILED' } })
  ])

  return { pending, processing, completed, failed, total: pending + processing + completed + failed }
}
