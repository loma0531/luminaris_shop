import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getNextSequence } from '@/lib/counter'
import { logger, createTimer } from '@/lib/logger'
import { requireUserAuth } from '@/lib/adminAuth'
import { CART_LIMITS } from '@/lib/cartLimits'
import { validateCSRFToken, deleteCSRFToken } from '@/lib/redis'

import { CheckoutSchema } from '@/lib/schemas'
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

    // CSRF Protection: Token is required for checkout
    if (!sessionId || !csrfToken) {
      logger.security.suspiciousActivity('Missing CSRF token', minecraftName)
      return NextResponse.json({ error: 'CSRF token required' }, { status: 403 })
    }
    
    const isValidCSRF = await validateCSRFToken(sessionId, csrfToken)
    if (!isValidCSRF) {
      logger.security.suspiciousActivity('Invalid CSRF token', minecraftName)
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 })
    }
    // Delete token after successful validation (one-time use)
    await deleteCSRFToken(sessionId)

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
