import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getNextSequence } from '@/lib/counter'
import { logger, createTimer } from '@/lib/logger'
import { requireUserAuth } from '@/lib/adminAuth'
import { CART_LIMITS } from '@/lib/cartLimits'
import { validateCSRFToken, deleteCSRFToken } from '@/lib/redis'
import { getProductActivePrice, isProductOnSale } from '@/lib/productPricing'

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
    const authError = await requireUserAuth(request, minecraftName)
    if (authError) return authError

    if (items.length > CART_LIMITS.MAX_ITEM_TYPES) {
      logger.security.suspiciousActivity(`Attempted to order more than ${CART_LIMITS.MAX_ITEM_TYPES} item types`, minecraftName)
      return NextResponse.json({ error: `Too many items in order (max ${CART_LIMITS.MAX_ITEM_TYPES})` }, { status: 400 })
    }

    // Security: Fetch products from database to prevent price manipulation and command injection
    const productIds = items.map(item => item.productId)
    const dbProducts = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      },
    })

    const productMap = new Map(dbProducts.map((p) => [p.id, p]))

    const sanitizedItems: { productId: string; name: string; price: number; quantity: number; commands: string[]; customInput: string | null }[] = []
    let calculatedTotal = 0 // ยอดเงินรวมสินค้า (ที่ลดโปรโมชันแล้ว)
    let eligibleTotal = 0 // ยอดสินค้าปกติสำหรับนำคูปองไปคิดส่วนลด
    let discountItemsCount = 0

    for (const item of items) {
      const dbProduct = productMap.get(item.productId)
      if (!dbProduct) {
        logger.security.suspiciousActivity(`Product not found or inactive during checkout: ${item.productId}`, minecraftName)
        return NextResponse.json({ error: 'สินค้าไม่ถูกต้องหรือถูกปิดใช้งานแล้ว' }, { status: 400 })
      }

      // คำนวณราคาปัจจุบันของสินค้าแบบไดนามิก (ตามโปรโมชันและช่วงเวลากำหนด)
      const currentActivePrice = getProductActivePrice(dbProduct)

      // Overwrite name, price, and commands with values from the database
      const verifiedItem = {
        productId: dbProduct.id,
        name: dbProduct.name,
        price: currentActivePrice,
        quantity: item.quantity,
        commands: dbProduct.commands, // CRITICAL: Server-controlled commands!
        customInput: item.customInput || null,
      }

      sanitizedItems.push(verifiedItem)
      const itemTotalPrice = verifiedItem.price * verifiedItem.quantity
      calculatedTotal += itemTotalPrice
      
      if (isProductOnSale(dbProduct)) {
        discountItemsCount += 1
      }
      eligibleTotal += itemTotalPrice
    }

    // ─── ตรวจสอบและใช้งานคูปองส่วนลด ───
    let coupon = null
    let discountAmount = 0
    
    if (validation.data.couponCode) {
      const cleanCouponCode = validation.data.couponCode.trim().toUpperCase()
      coupon = await prisma.coupon.findUnique({
        where: { code: cleanCouponCode }
      })

      if (!coupon || !coupon.isActive) {
        return NextResponse.json({ error: 'คูปองไม่ถูกต้องหรือหมดอายุการใช้งานแล้ว' }, { status: 400 })
      }

      if (coupon.discountType === 'COIN') {
        return NextResponse.json({ error: 'คูปองนี้ใช้สำหรับแลก Coin เท่านั้น' }, { status: 400 })
      }

      const now = new Date()
      if (coupon.startDate && now < new Date(coupon.startDate)) {
        return NextResponse.json({ error: 'คูปองนี้ยังไม่ถึงระยะเวลาเริ่มใช้งาน' }, { status: 400 })
      }
      if (coupon.endDate && now > new Date(coupon.endDate)) {
        return NextResponse.json({ error: 'คูปองนี้หมดอายุการใช้งานแล้ว' }, { status: 400 })
      }
      if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
        return NextResponse.json({ error: 'สิทธิ์การใช้งานคูปองนี้เต็มแล้ว' }, { status: 400 })
      }

      // ตรวจสอบจำนวนสิทธิ์ที่ผู้ใช้รายนี้เคยใช้ไปแล้ว
      const userUsageCount = await prisma.couponUsage.count({
        where: {
          couponId: coupon.id,
          minecraftName: minecraftName,
        }
      })
      
      if (userUsageCount >= coupon.maxUsesPerUser) {
        return NextResponse.json({ 
          error: `คุณใช้งานคูปองนี้เต็มโควตาแล้ว (จำกัด ${coupon.maxUsesPerUser} ครั้งต่อบัญชี)` 
        }, { status: 400 })
      }


      // ตรวจยอดซื้อขั้นต่ำ
      if (calculatedTotal < coupon.minSpend) {
        return NextResponse.json({ 
          error: `ยอดรวมสินค้าไม่ถึงเกณฑ์การใช้งานคูปอง (ขั้นต่ำ ฿${coupon.minSpend})` 
        }, { status: 400 })
      }

      // คำนวณยอดเงินส่วนลดจากสินค้าที่มีสิทธิ์เข้าร่วม
      if (coupon.discountType === 'PERCENTAGE') {
        discountAmount = eligibleTotal * (coupon.discountValue / 100)
        if (coupon.maxDiscount !== null && discountAmount > coupon.maxDiscount) {
          discountAmount = coupon.maxDiscount
        }
      } else if (coupon.discountType === 'FIXED') {
        discountAmount = coupon.discountValue
      }

      const subtotalBeforeCoupon = calculatedTotal
      const finalDiscountAmount = Math.min(discountAmount, eligibleTotal)
      
      // ประกันว่ายอดชำระเงินสุทธิสุดท้ายหลังหักส่วนลดคูปองจะต้องมีมูลค่าอย่างน้อย 1 บาท
      calculatedTotal = Math.max(1, subtotalBeforeCoupon - finalDiscountAmount)
      discountAmount = subtotalBeforeCoupon - calculatedTotal
    }

    if (Math.abs(calculatedTotal - total) > 1) {
       logger.security.priceManipulation(total, calculatedTotal, minecraftName)
       return NextResponse.json({ error: 'ยอดชำระเงินไม่ถูกต้อง' }, { status: 400 })
    }
    
    // Check total quantity limit
    const totalQuantity = sanitizedItems.reduce((sum, item) => sum + item.quantity, 0)
    if (totalQuantity > CART_LIMITS.MAX_TOTAL_QUANTITY) {
      logger.security.suspiciousActivity(`Total quantity ${totalQuantity} exceeds limit`, minecraftName)
      return NextResponse.json({ error: `Total quantity exceeds limit (max ${CART_LIMITS.MAX_TOTAL_QUANTITY})` }, { status: 400 })
    }

    const paymentSeqId = await getNextSequence('payment_id')
    const orderSeqId = await getNextSequence('order_id')

    // รันการเขียนฐานข้อมูลแบบ Transaction-Safe
    const result = await prisma.$transaction(async (tx) => {
      if (coupon) {
        // อัปเดตยอดการใช้คูปองในระบบส่วนกลาง
        const updatedCoupon = await tx.coupon.update({
          where: { id: coupon.id },
          data: { usedCount: { increment: 1 } }
        })

        // ป้องกันสิทธิ์การใช้เต็มชนเพดานแบบ Real-time
        if (updatedCoupon.maxUses !== null && updatedCoupon.usedCount > updatedCoupon.maxUses) {
          throw new Error('COUPON_LIMIT_EXCEEDED')
        }
      }

      const payment = await tx.payment.create({
        data: { paymentId: paymentSeqId, minecraftName, amount: calculatedTotal, status: 'PENDING' },
      })

      const order = await tx.order.create({
        data: {
          orderId: orderSeqId, minecraftName, total: calculatedTotal, status: 'AWAITING_PAYMENT',
          paymentId: payment.id, items: sanitizedItems,
        },
      })

      if (coupon) {
        // บันทึกประวัติการใช้งานคูปองรายคน
        await tx.couponUsage.create({
          data: {
            couponId: coupon.id,
            minecraftName: minecraftName,
            orderId: order.id,
            discountedAmt: discountAmount,
          }
        })
        
        // ลบคูปองทิ้งเมื่อสิทธิ์การใช้งานเต็มแล้วตามที่ร้องขอ
        const updatedCoupon = await tx.coupon.findUnique({ where: { id: coupon.id } })
        if (updatedCoupon && updatedCoupon.maxUses !== null && updatedCoupon.usedCount >= updatedCoupon.maxUses) {
          await tx.coupon.delete({ where: { id: coupon.id } })
        }
      }

      return { payment, order }
    })

    const { payment, order } = result

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
    
    if (errorMessage === 'COUPON_LIMIT_EXCEEDED') {
      return NextResponse.json({ error: 'สิทธิ์คูปองเต็มหมดแล้วในเสี้ยววินาทีนี้พอดี' }, { status: 400 })
    }
    
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 })
  }
}
