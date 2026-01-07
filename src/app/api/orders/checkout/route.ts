import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { verifySlip } from '@/lib/slipok'
import { giveItemsToPlayer } from '@/lib/rcon'
import { getNextSequence } from '@/lib/counter'
import { isValidMinecraftName } from '@/lib/inputValidation'
import { logger, createTimer } from '@/lib/logger'
import { requireUserAuth } from '@/lib/adminAuth'
import { CART_LIMITS } from '@/lib/cartLimits'
import { OrderItem } from '@/lib/types'
import { validateCSRFToken, deleteCSRFToken } from '@/lib/redis'

import { CheckoutSchema } from '@/lib/schemas'
import { replaceCustomInputInCommand } from '@/lib/nickColorValidation'
import * as z from 'zod'

// Create pending order and payment
export async function POST(request: NextRequest) {
  const timer = createTimer()
  try {
    const json = await request.json()
    
    // Validate with Zod
    const validation = CheckoutSchema.safeParse(json)
    if (!validation.success) {
      const errorMsg = validation.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')
      logger.security.invalidInput('checkout', errorMsg)
      return NextResponse.json({ error: `Validation error: ${errorMsg}` }, { status: 400 })
    }

    const { minecraftName, items, total, sessionId, csrfToken } = validation.data

    // CSRF Protection: Validate token if provided
    if (sessionId && csrfToken) {
      const isValidCSRF = await validateCSRFToken(sessionId, csrfToken)
      if (!isValidCSRF) {
        logger.security.suspiciousActivity('Invalid CSRF token', minecraftName)
        return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 })
      }
      // Delete token after successful validation (one-time use)
      await deleteCSRFToken(sessionId)
    }

    /* 
       Manual validation removed as Zod handles specific formats.
       Additional logic checks (business rules) follow below.
    */

    // Security: Verify user authentication
    const authError = requireUserAuth(request, minecraftName)
    if (authError) return authError

    if (items.length > CART_LIMITS.MAX_ITEM_TYPES) {
      logger.security.suspiciousActivity(`Attempted to order more than ${CART_LIMITS.MAX_ITEM_TYPES} item types`, minecraftName)
      return NextResponse.json({ error: `Too many items in order (max ${CART_LIMITS.MAX_ITEM_TYPES})` }, { status: 400 })
    }

    // Double check total calculation for safety
    const calculatedTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    if (Math.abs(calculatedTotal - total) > 1) {
       logger.security.priceManipulation(total, calculatedTotal, minecraftName)
       return NextResponse.json({ error: 'Total amount mismatch' }, { status: 400 })
    }
    
    // Check total quantity limit
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
    if (totalQuantity > CART_LIMITS.MAX_TOTAL_QUANTITY) {
      logger.security.suspiciousActivity(`Total quantity ${totalQuantity} exceeds limit`, minecraftName)
      return NextResponse.json({ error: `Total quantity exceeds limit (max ${CART_LIMITS.MAX_TOTAL_QUANTITY})` }, { status: 400 })
    }

    // Prepare sanitized items for Prisma (mapping Zod result to exact Prisma needs if necessary, though they match)
    const sanitizedItems = items // Zod already guaranteed structure

    const paymentSeqId = await getNextSequence('payment_id')
    const orderSeqId = await getNextSequence('order_id')

    const payment = await prisma.payment.create({
      data: { paymentId: paymentSeqId, minecraftName, amount: calculatedTotal, status: 'PENDING' },
    })

    const order = await prisma.order.create({
      data: {
        orderId: orderSeqId, minecraftName, total: calculatedTotal, status: 'AWAITING_PAYMENT',
        paymentId: payment.id, items: sanitizedItems,
      },
    })

    logger.order.created(orderSeqId, minecraftName, calculatedTotal, sanitizedItems.length, timer())
    
    // Log each item
    for (const item of sanitizedItems) {
      logger.order.itemDetail(item.name, item.quantity, item.price)
    }

    logger.payment.created(paymentSeqId, minecraftName, calculatedTotal)

    return NextResponse.json({
      success: true, orderId: order.orderId, paymentId: payment.paymentId,
      paymentObjectId: payment.id, orderObjectId: order.id, createdAt: order.createdAt,
    }, { status: 201 })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Failed to create order: ${errorMessage}`)
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 })
  }
}

// Process payment (verify slip and deliver items)
export async function PUT(request: NextRequest) {
  const timer = createTimer()
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const amount = Number(formData.get('amount'))
    const minecraftName = formData.get('minecraftName') as string
    const paymentId = Number(formData.get('paymentId'))
    const orderId = Number(formData.get('orderId'))

    if (!file) {
      return NextResponse.json({ success: false, error: 'Slip file is required' }, { status: 400 })
    }
    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid amount' }, { status: 400 })
    }
    if (!minecraftName || !isValidMinecraftName(minecraftName)) {
      return NextResponse.json({ success: false, error: 'Invalid minecraft name' }, { status: 400 })
    }
    if (!paymentId || isNaN(paymentId)) {
      return NextResponse.json({ success: false, error: 'Invalid payment ID' }, { status: 400 })
    }
    if (!orderId || isNaN(orderId)) {
      return NextResponse.json({ success: false, error: 'Invalid order ID' }, { status: 400 })
    }

    logger.payment.slipUploaded(paymentId, minecraftName)

    const payment = await prisma.payment.findUnique({ where: { paymentId } })
    if (!payment) {
      logger.payment.notFound(paymentId)
      return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 })
    }
    if (payment.status !== 'PENDING') {
      logger.payment.alreadyProcessed(paymentId)
      return NextResponse.json({ success: false, error: 'Payment already processed' }, { status: 400 })
    }

    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
    }
    
    // Security: Verify user owns this order
    const authError = requireUserAuth(request, order.minecraftName)
    if (authError) {
      logger.security.accessDenied(`Order ${orderId}`, 'Attempted payment upload without ownership')
      return authError
    }
    
    if (order.status !== 'AWAITING_PAYMENT') {
      return NextResponse.json({ success: false, error: 'Order already processed' }, { status: 400 })
    }

    if (order.minecraftName !== minecraftName) {
      logger.security.suspiciousActivity(`Name mismatch - Order: ${order.minecraftName}, Request: ${minecraftName}`, minecraftName)
      return NextResponse.json({ success: false, error: 'Authorization failed' }, { status: 403 })
    }


    // Security: Validate file type using Magic Bytes
    // This prevents uploading malicious scripts renamed as images
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const { validateFileMagicBytes } = await import('@/lib/fileValidation')
    
    const fileValidation = validateFileMagicBytes(buffer, file.type)
    if (!fileValidation.valid) {
       logger.security.suspiciousActivity(`Invalid slip magic bytes: ${fileValidation.detectedType}`, minecraftName)
       return NextResponse.json({ success: false, error: 'Invalid file format. Please upload a valid image.' }, { status: 400 })
    }

    logger.payment.slipVerifying(paymentId)
    // Pass buffer directly to avoid re-reading
    const slipResult = await verifySlip(file)

    if (!slipResult.success) {
      logger.payment.slipRejected(paymentId, slipResult.error?.message || 'Unknown')
      return NextResponse.json({ success: false, error: slipResult.error?.message || 'Invalid slip' })
    }

    const verifiedAmount = slipResult.data?.amount || 0
    if (Math.abs(verifiedAmount - amount) > 1) {
      logger.payment.amountMismatch(paymentId, amount, verifiedAmount)
      return NextResponse.json({ success: false, error: `Amount mismatch` })
    }

    // Security: Check for duplicate slip (transRef reuse)
    const transRef = slipResult.data?.transRef || null
    if (transRef) {
      const existingPayment = await prisma.payment.findFirst({
        where: { slipRef: transRef, status: 'VERIFIED' }
      })
      if (existingPayment) {
        logger.security.suspiciousActivity(`Duplicate slip transRef: ${transRef}`, minecraftName)
        return NextResponse.json({ success: false, error: 'This slip has already been used' }, { status: 400 })
      }
    }

    // Use transaction to update payment and order atomically
    await prisma.$transaction([
      prisma.payment.update({
        where: { paymentId },
        data: { status: 'VERIFIED', slipRef: transRef, verifiedAt: new Date() },
      }),
      prisma.order.update({ where: { orderId }, data: { status: 'COMPLETED' } })
    ])

    logger.payment.slipVerified(paymentId, minecraftName, verifiedAmount)
    logger.payment.statusChanged(paymentId, 'PENDING', 'VERIFIED')

    logger.order.statusChanged(orderId, 'AWAITING_PAYMENT', 'COMPLETED', minecraftName)
    logger.order.completed(orderId, minecraftName, order.total, timer())

    // Update sold counts using transaction for better performance
    try {
      await prisma.$transaction(
        order.items.map((item: { productId: string; quantity: number }) => 
          prisma.product.update({
            where: { id: item.productId },
            data: { soldCount: { increment: item.quantity } },
          })
        )
      )
    } catch {
      // Log but don't fail - sold count is not critical
      logger.warn('Failed to update some product sold counts', 500)
    }

    // Execute RCON - Detailed logging for item delivery
    const orderItems = order.items as OrderItem[]
    const itemsWithCommands = orderItems.filter((item) => item.commands && item.commands.length > 0)
    const totalItemCount = itemsWithCommands.reduce((sum, item) => sum + item.quantity, 0)
    
    logger.rcon.deliveryStarted(orderId, order.minecraftName, itemsWithCommands.length)
    logger.info(`RCON Config: host=${process.env.RCON_HOST}, port=${process.env.RCON_PORT}, password=${process.env.RCON_PASSWORD ? '[SET]' : '[NOT SET]'}`, 200)
    
    // OPTIMIZATION: Collect ALL commands into a single list to execute in one connection
    // This prevents "Too many connections" errors and is much faster
    const allCommandsToExecute: string[] = []
    const commandMap: { command: string, item: string }[] = [] // To track which command belongs to which item for reporting

    for (const item of itemsWithCommands) {
      for (let i = 0; i < item.quantity; i++) {
        for (const cmd of item.commands) {
           // แทนที่ {customInput} ด้วยค่าจริง (ถ้ามี)
           const processedCmd = item.customInput 
             ? replaceCustomInputInCommand(cmd, item.customInput)
             : cmd
           allCommandsToExecute.push(processedCmd)
           commandMap.push({ command: processedCmd, item: item.name })
        }
      }
    }

    let successCount = 0
    let failCount = 0
    const deliveryResults: { item: string; success: boolean; error?: string }[] = []

    if (allCommandsToExecute.length > 0) {
      logger.info(`Batch executing ${allCommandsToExecute.length} commands completely...`, 200)
      
      try {
        const result = await giveItemsToPlayer(order.minecraftName, allCommandsToExecute)
        
        if (result.success) {
           successCount = allCommandsToExecute.length
           logger.rcon.deliveryCompleted(orderId, order.minecraftName, successCount, 0)
           
           // Mark strictly as delivered
           await prisma.order.update({
             where: { orderId },
             data: { isDelivered: true }
           })
        } else {
           // If batch fails, we consider it a failure for safety, though some might have executed.
           // RCON protocol doesn't always confirm execution per-line easily in batch without custom parsing
           // But 'giveItemsToPlayer' returns success=false if ANY fail/throw
           failCount = allCommandsToExecute.length
           logger.rcon.failed(order.minecraftName, `Batch RCON failed: ${result.results.join('; ')}`)
           
            // Queue ALL commands for retry since we aren't sure which specific ones failed/succeeded perfectly
            // Or ideally, `giveItemsToPlayer` wraps them safely.
            // Let's queue them to be safe.
            await Promise.all(allCommandsToExecute.map((cmd: string) => 
               prisma.commandQueue.create({
                 data: {
                   command: cmd,
                   minecraftName: order.minecraftName,
                   orderId: order.id,
                   status: 'PENDING',
                   lastError: result.results.join('; ').substring(0, 500)
                 }
               })
             ))
             
             await prisma.order.update({
                where: { orderId },
                data: { deliveryAttempts: { increment: 1 } }
             })
        }
        
        // Populate deliveryResults for response (simplified for batch)
        itemsWithCommands.forEach((item: OrderItem) => {
           deliveryResults.push({ 
             item: item.name, 
             success: result.success, 
             error: result.success ? undefined : 'Batch execution failed' 
           })
        })

      } catch (e) {
         failCount = allCommandsToExecute.length
         const err = e instanceof Error ? e.message : String(e)
         logger.rcon.failed(order.minecraftName, `Critical Batch Error: ${err}`)
         
         // Queue for retry
         await Promise.all(allCommandsToExecute.map((cmd: string) => 
            prisma.commandQueue.create({
              data: {
                 command: cmd,
                  minecraftName: order.minecraftName,
                  orderId: order.id,
                  status: 'PENDING',
                  lastError: err.substring(0, 500)
              }
            })
         ))
         
         await prisma.order.update({
            where: { orderId },
            data: { deliveryAttempts: { increment: 1 } }
         })
         
         itemsWithCommands.forEach((item: OrderItem) => {
           deliveryResults.push({ item: item.name, success: false, error: err })
        })
      }
    } else {
       // No commands to run (e.g. items have no commands)
       await prisma.order.update({
         where: { orderId },
         data: { isDelivered: true }
       })
    }

    const deliveryPassed = failCount === 0
    const deliveryFailedEntirely = failCount > 0

    return NextResponse.json({
      success: true,
      orderId: order.orderId,
      paymentId: payment.paymentId,
      status: 'COMPLETED',
      delivery: {
        total: totalItemCount,
        successCount,
        failCount,
        results: deliveryResults,
        status: deliveryPassed ? 'SUCCESS' : (deliveryFailedEntirely ? 'FAILED' : 'PARTIAL_FAILED'),
        message: deliveryPassed ? 'Delivery successful' : (deliveryFailedEntirely ? 'Delivery failed - please contact admin' : 'Some items failed to deliver - please contact admin')
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Failed to process payment: ${errorMessage}`)
    return NextResponse.json({ success: false, error: 'Payment processing failed' }, { status: 500 })
  }
}
