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
 * M3: ใช้ Redis distributed lock เพื่อป้องกัน double-processing เมื่อรัน cron หลาย instance
 */
export async function processCommandQueue(): Promise<ProcessResult> {
  const result: ProcessResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0
  }

  // M3 Fix: Distributed Lock ผ่าน Redis
  // ป้องกันกรณีที่ cron หลาย instance รันพร้อมกันและ process ซ้ำ
  const LOCK_KEY = 'lock:queue-worker'
  const LOCK_TTL_SECONDS = 60 // lock หมดอายุ 60 วินาที (กัน deadlock)
  let lockAcquired = false

  try {
    const { getCache } = await import('@/lib/cache/index')
    const { RedisCacheAdapter } = await import('@/lib/cache/RedisCacheAdapter')
    const cache = getCache()

    if (cache instanceof RedisCacheAdapter && await cache.isHealthy()) {
      const client = cache.getRawClient()
      // SET NX EX — atomic: ตั้งค่าถ้ายังไม่มี key นี้ พร้อม TTL
      const acquired = await client.set(LOCK_KEY, '1', 'EX', LOCK_TTL_SECONDS, 'NX')
      if (!acquired) {
        // Instance อื่นกำลัง process อยู่ → skip
        logger.debug('Queue worker: Lock not acquired, another instance is running', 200)
        return result
      }
      lockAcquired = true
    }
    // ถ้าไม่มี Redis → fail-open (ยอมให้ process ต่อ แต่อาจ double-process ได้)
  } catch (lockErr) {
    logger.warn(`Queue worker: Could not acquire distributed lock (fail-open): ${lockErr}`, 200)
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
        
        // ปรับปรุงเป็น Bulk Update (updateMany) เพื่อลด N+1 queries ในกรณีเกิด error
        const failedCmdIds = commands.filter(c => c.retryCount + 1 >= MAX_RETRIES).map(c => c.id)
        const pendingCmdIds = commands.filter(c => c.retryCount + 1 < MAX_RETRIES).map(c => c.id)

        if (failedCmdIds.length > 0) {
          await prisma.commandQueue.updateMany({
            where: { id: { in: failedCmdIds } },
            data: { 
              status: 'FAILED',
              retryCount: { increment: 1 },
              lastError: errorMessage.substring(0, 500)
            }
          })
          result.failed += failedCmdIds.length
        }

        if (pendingCmdIds.length > 0) {
          await prisma.commandQueue.updateMany({
            where: { id: { in: pendingCmdIds } },
            data: { 
              status: 'PENDING',
              retryCount: { increment: 1 },
              lastError: errorMessage.substring(0, 500)
            }
          })
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
  } finally {
    // M3: Release lock เมื่อ process เสร็จ (ไม่ว่าจะ success หรือ error)
    // ทำให้ instance ถัดไปสามารถ acquire lock ได้ทันที แทนที่จะรอ TTL หมด
    if (lockAcquired) {
      try {
        const { getCache } = await import('@/lib/cache/index')
        const { RedisCacheAdapter } = await import('@/lib/cache/RedisCacheAdapter')
        const cache = getCache()
        if (cache instanceof RedisCacheAdapter) {
          await cache.getRawClient().del('lock:queue-worker')
        }
      } catch {
        // ignore — lock จะหมดอายุเองตาม TTL
      }
    }
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
