import { NextRequest, NextResponse } from 'next/server'
import { giveItemsToPlayer } from '@/lib/rcon'
import prisma from '@/lib/prisma'
import { requireAdminAuth, requireUserAuth } from '@/lib/adminAuth'
import { logger, createTimer } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { playerName, commands, orderId, adminOverride } = body

    if (!playerName || !commands || !Array.isArray(commands)) {
      return NextResponse.json({ error: 'Player name and commands are required' }, { status: 400 })
    }

    if (adminOverride) {
      const authError = requireAdminAuth(request)
      if (authError) return authError
      logger.info(`Admin sending commands to ${playerName}`, 200)
    } else if (orderId) {
      // REQUIREMENT: User must be authenticated to trigger RCON for their own order
      const authError = requireUserAuth(request, playerName)
      if (authError) return authError

      const order = await prisma.order.findUnique({ where: { id: orderId } })

      if (!order) {
        logger.security.suspiciousActivity(`Invalid order ID: ${orderId}`)
        return NextResponse.json({ error: 'Invalid order ID' }, { status: 403 })
      }

      // CRITICAL: Verify order is completed (paid) before executing RCON
      if (order.status !== 'COMPLETED') {
        logger.security.accessDenied('RCON', `Attempted execution on ${order.status} order: ${orderId}`)
        return NextResponse.json({ error: 'Order must be completed before execution' }, { status: 403 })
      }

      // PREVENTION: Replay attack check
      if (order.isDelivered) {
        logger.security.suspiciousActivity(`Replay attack prevented - Order already delivered: ${orderId}`, playerName)
        return NextResponse.json({ error: 'Items already delivered for this order' }, { status: 403 })
      }

      if (order.minecraftName.toLowerCase() !== playerName.toLowerCase()) {
        logger.security.suspiciousActivity(`Name mismatch - Order: ${order.minecraftName}, Request: ${playerName}`, playerName)
        return NextResponse.json({ error: 'Player name does not match order' }, { status: 403 })
      }

      const orderCommands = order.items.flatMap(item => item.commands)
      const commandsMatch = commands.every((cmd: string) => orderCommands.includes(cmd))
      
      if (!commandsMatch) {
        logger.security.suspiciousActivity(`Commands don't match order: ${orderId}`, playerName)
        return NextResponse.json({ error: 'Commands do not match order' }, { status: 403 })
      }

      logger.info(`Sending items for order #${order.orderId} to ${playerName}`, 200)
    } else {
      logger.security.accessDenied('RCON', 'No authentication')
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const dangerousPatterns = [
      /^op\s+/i, /^deop\s+/i, /^stop$/i, /^ban\s+/i, /^pardon\s+/i,
      /^whitelist\s+/i, /^kick\s+/i, /^gamemode\s+/i, /^tp\s+/i,
    ]

    for (const cmd of commands) {
      if (dangerousPatterns.some(pattern => pattern.test(cmd))) {
        logger.rcon.commandBlocked(cmd, playerName)
        return NextResponse.json({ error: 'Command not allowed' }, { status: 403 })
      }
    }

    const timer = createTimer()
    logger.rcon.executing(playerName, commands.length)
    
    const result = await giveItemsToPlayer(playerName, commands)
    
    if (result.success) {
      logger.rcon.executed(playerName, commands.length, timer())
      // Mark as delivered if not admin override
      if (orderId && !adminOverride) {
        await prisma.order.update({
          where: { id: orderId },
          data: { isDelivered: true }
        })
      }
    } else {
      logger.rcon.failed(playerName, 'Command execution failed')
      if (orderId && !adminOverride) {
        await prisma.order.update({
          where: { id: orderId },
          data: { deliveryAttempts: { increment: 1 } }
        })
      }
    }
    
    return NextResponse.json(result)
  } catch {
    logger.system.error('RCON failed')
    return NextResponse.json({ success: false, error: 'Failed to execute commands' }, { status: 500 })
  }
}
