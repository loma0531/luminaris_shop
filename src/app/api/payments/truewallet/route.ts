import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { redeemTruewalletVoucher } from '@/lib/truewallet'
import { shopConfig } from '@/lib/config'
import { isValidMinecraftName } from '@/lib/inputValidation'
import { logger, createTimer } from '@/lib/logger'
import { requireUserAuth } from '@/lib/adminAuth'
import { OrderItem } from '@/lib/types'
import { sendTruewalletLog, sendSecurityAlert } from '@/lib/webhook'
import { verifyPlayerInDatabase } from '@/lib/mysql'
// H1 Fix: ใช้ FulfillmentService แทนการ copy โค้ด RCON ซ้ำ
import { FulfillmentService } from '@/core/services/FulfillmentService'
import type { OrderItemForDelivery } from '@/core/services/FulfillmentService'

/**
 * POST /api/payments/truewallet
 * ชำระเงินด้วย Truewallet Voucher URL
 */
export async function POST(request: NextRequest) {
  const timer = createTimer()
  
  try {
    const json = await request.json()
    const { voucherUrl, orderId, paymentId, minecraftName } = json

    // ค้นหาชื่อจริงที่สะกดถูกต้องจาก MySQL (เพื่อทำ Case Normalization)
    const playerCheck = await verifyPlayerInDatabase(minecraftName)
    const officialMinecraftName = playerCheck.exists && playerCheck.playerData 
      ? playerCheck.playerData.username 
      : minecraftName

    // Validate inputs
    if (!voucherUrl || typeof voucherUrl !== 'string') {
      return NextResponse.json({ success: false, error: 'กรุณาใส่ลิงก์ซองอั่งเปา' }, { status: 400 })
    }
    if (!orderId || typeof orderId !== 'number') {
      return NextResponse.json({ success: false, error: 'Invalid order ID' }, { status: 400 })
    }
    if (!paymentId || typeof paymentId !== 'number') {
      return NextResponse.json({ success: false, error: 'Invalid payment ID' }, { status: 400 })
    }
    if (!minecraftName || !isValidMinecraftName(minecraftName)) {
      return NextResponse.json({ success: false, error: 'Invalid minecraft name' }, { status: 400 })
    }

    // Get phone number from environment
    const phoneNumber = process.env.TRUEWALLET_PHONE
    if (!phoneNumber) {
      logger.system.error('TRUEWALLET_PHONE not configured')
      return NextResponse.json({ success: false, error: 'ระบบ Truewallet ยังไม่พร้อมใช้งาน' }, { status: 500 })
    }

    // Fetch payment and order
    const payment = await prisma.payment.findUnique({ where: { paymentId } })
    if (!payment) {
      return NextResponse.json({ success: false, error: 'ไม่พบรายการชำระเงิน' }, { status: 404 })
    }
    if (payment.status !== 'PENDING') {
      return NextResponse.json({ success: false, error: 'รายการนี้ถูกดำเนินการไปแล้ว' }, { status: 400 })
    }

    const order = await prisma.order.findUnique({ where: { orderId } })
    if (!order) {
      return NextResponse.json({ success: false, error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 })
    }

    // Security: Verify user owns this order
    const authError = await requireUserAuth(request, order.minecraftName)
    if (authError) {
      logger.security.accessDenied(`Order ${orderId}`, 'Truewallet payment without ownership')
      return authError
    }

    if (order.status !== 'AWAITING_PAYMENT') {
      return NextResponse.json({ success: false, error: 'คำสั่งซื้อนี้ถูกดำเนินการไปแล้ว' }, { status: 400 })
    }

    if (order.minecraftName !== minecraftName) {
      logger.security.suspiciousActivity(`Name mismatch - Order: ${order.minecraftName}, Request: ${minecraftName}`, minecraftName)
      return NextResponse.json({ success: false, error: 'การยืนยันตัวตนล้มเหลว' }, { status: 403 })
    }

    // ตรวจสอบยอดชำระเงินขั้นต่ำของ TrueWallet
    const minAmount = shopConfig.orders.payments.truewallet.minAmount || 10
    if (order.total < minAmount) {
      logger.security.suspiciousActivity(`Truewallet payment attempted for order ${orderId} below minimum amount (${order.total} < ${minAmount})`, minecraftName)
      return NextResponse.json({ 
        success: false, 
        error: `ยอดชำระเงินต่ำกว่าเกณฑ์ขั้นต่ำ ${minAmount} บาท ไม่สามารถชำระเงินผ่าน TrueMoney ได้` 
      }, { status: 400 })
    }

    // ATOMIC LOCK: ป้องกัน Race Condition โดยการเปลี่ยนสถานะก่อนทำงาน
    const lockedPayment = await prisma.payment.updateMany({
      where: { paymentId, status: 'PENDING' },
      data: { status: 'VERIFIED', paymentMethod: 'truewallet_processing' }
    });

    if (lockedPayment.count === 0) {
      logger.warn(`Truewallet double-spend attempt blocked for order ${orderId}`, 409)
      return NextResponse.json({ success: false, error: 'รายการนี้กำลังถูกดำเนินการหรือเสร็จสิ้นแล้ว' }, { status: 409 })
    }

    logger.info(`Truewallet payment attempt - Order: ${orderId}, Player: ${minecraftName}`, 200)

    // Redeem voucher
    const redeemResult = await redeemTruewalletVoucher(phoneNumber, voucherUrl)
    
    // Prepare order items for log
    const orderItemsForLog = (order.items as OrderItem[]).map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    }))
    
    if (!redeemResult.success) {
      logger.warn(`Truewallet redeem failed for order ${orderId}: ${redeemResult.error}`, 400)
      
      // Rollback lock
      await prisma.payment.updateMany({
        where: { paymentId },
        data: { status: 'PENDING', paymentMethod: null }
      });

      // Send failed log to Discord
      await sendTruewalletLog({
        orderId,
        minecraftName,
        amount: order.total,
        voucherUrl,
        items: orderItemsForLog,
        status: 'FAILED',
        errorMessage: redeemResult.error,
      })
      
      return NextResponse.json({ success: false, error: redeemResult.error }, { status: 400 })
    }

    // Verify amount matches
    const voucherAmount = redeemResult.amount || 0
    if (voucherAmount < order.total) {
      logger.warn(`Truewallet amount mismatch - Expected: ${order.total}, Got: ${voucherAmount}`, 400)
      
      // Rollback lock
      await prisma.payment.updateMany({
        where: { paymentId },
        data: { status: 'PENDING', paymentMethod: null }
      });

      // M7 Fix: ส่ง Security Alert ไปยัง Discord เมื่อยอดเงินไม่ตรง
      sendSecurityAlert('AMOUNT_MISMATCH', {
        orderId,
        minecraftName,
        message: `ยอดเงินในซองไม่เพียงพอ — ต้องการ ${order.total}฿ แต่ได้รับ ${voucherAmount}฿`,
        transRef: redeemResult.code,
      }).catch(() => {}) // fire-and-forget

      return NextResponse.json({ 
        success: false, 
        error: `จำนวนเงินในซองไม่เพียงพอ (ต้องการ ${order.total} บาท, ได้รับ ${voucherAmount} บาท)` 
      }, { status: 400 })
    }

    // Update payment and order status (C4-related: ใช้ interactive transaction)
    const transRef = `TW-${redeemResult.code || Date.now()}`
    
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { paymentId },
        data: { 
          status: 'VERIFIED', 
          paymentMethod: 'truewallet',
          stripePaymentIntentId: transRef, 
          verifiedAt: new Date() 
        },
      })
      await tx.order.update({ 
        where: { orderId }, 
        data: { status: 'COMPLETED' } 
      })
      
      if (order.isTopUp) {
        await tx.user.upsert({
          where: { minecraftName: officialMinecraftName },
          update: {
            totalSpent: { increment: order.total },
            coins: { increment: payment.coinsEarned || 0.0 }
          },
          create: {
            minecraftName: officialMinecraftName,
            totalSpent: order.total,
            coins: payment.coinsEarned || 0.0
          },
        })
        
        await tx.coinTransaction.create({
          data: {
            minecraftName: officialMinecraftName,
            amount: payment.coinsEarned || 0.0,
            type: 'TOPUP',
            description: `เติมเงินสะสมเหรียญด้วย TrueWallet (ซองของขวัญ) ออเดอร์ #${orderId} จำนวน ${voucherAmount} บาท รับ ${payment.coinsEarned || 0.0} Coin`,
          }
        })
      } else {
        await tx.user.upsert({
          where: { minecraftName: officialMinecraftName },
          update: { totalSpent: { increment: order.total } },
          create: { minecraftName: officialMinecraftName, totalSpent: order.total },
        })
      }
    })

    logger.payment.slipVerified(paymentId, officialMinecraftName, voucherAmount)
    logger.order.statusChanged(orderId, 'AWAITING_PAYMENT', 'COMPLETED', officialMinecraftName)
    logger.order.completed(orderId, officialMinecraftName, order.total, timer())

    // Send Truewallet-specific Discord notification
    await sendTruewalletLog({
      orderId,
      minecraftName: officialMinecraftName,
      amount: order.total,
      voucherUrl,
      voucherCode: redeemResult.code,
      ownerFullName: redeemResult.ownerFullName,
      items: orderItemsForLog,
      status: 'SUCCESS',
    })

    // Update sold counts (non-critical)
    try {
      if (!order.isTopUp) {
        await prisma.$transaction(
          order.items.map((item: { productId: string; quantity: number }) => 
            prisma.product.update({
              where: { id: item.productId },
              data: { soldCount: { increment: item.quantity } },
            })
          )
        )
      }
    } catch {
      logger.warn('Failed to update some product sold counts', 500)
    }

    if (order.isTopUp) {
      return NextResponse.json({
        success: true,
        orderId: order.orderId,
        paymentId: payment.paymentId,
        amount: voucherAmount,
        ownerFullName: redeemResult.ownerFullName,
        status: 'COMPLETED',
        delivery: {
          status: 'SUCCESS',
          message: 'เติมเงินสำเร็จและเหรียญถูกอัปเดตแล้ว',
        }
      })
    }

    // H1 Fix: ใช้ FulfillmentService แทนการเขียน RCON logic ซ้ำ
    const fulfillment = await FulfillmentService.fulfillOrder(
      orderId,
      order.id,
      officialMinecraftName,
      order.items as OrderItemForDelivery[]
    )

    return NextResponse.json({
      success: true,
      orderId: order.orderId,
      paymentId: payment.paymentId,
      amount: voucherAmount,
      ownerFullName: redeemResult.ownerFullName,
      status: 'COMPLETED',
      delivery: {
        status: fulfillment.status === 'SUCCESS' ? 'SUCCESS' : 'QUEUED',
        message: fulfillment.message,
      }
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Truewallet payment failed: ${errorMessage}`)
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการชำระเงิน' }, { status: 500 })
  }
}
