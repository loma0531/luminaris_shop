import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { redeemTruewalletVoucher } from '@/lib/truewallet'
import { giveItemsToPlayer } from '@/lib/rcon'
import { isValidMinecraftName } from '@/lib/inputValidation'
import { logger, createTimer } from '@/lib/logger'
import { requireUserAuth } from '@/lib/adminAuth'
import { OrderItem } from '@/lib/types'
import { sendTruewalletLog } from '@/lib/webhook'
import { replaceCustomInput } from '@/lib/inputValidation'

/**
 * POST /api/payments/truewallet
 * ชำระเงินด้วย Truewallet Voucher URL
 */
export async function POST(request: NextRequest) {
  const timer = createTimer()
  
  try {
    const json = await request.json()
    const { voucherUrl, orderId, paymentId, minecraftName } = json

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
    const authError = requireUserAuth(request, order.minecraftName)
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
      return NextResponse.json({ 
        success: false, 
        error: `จำนวนเงินในซองไม่เพียงพอ (ต้องการ ${order.total} บาท, ได้รับ ${voucherAmount} บาท)` 
      }, { status: 400 })
    }

    // Update payment and order status
    const transRef = `TW-${redeemResult.code || Date.now()}`
    
    await prisma.$transaction([
      prisma.payment.update({
        where: { paymentId },
        data: { 
          status: 'VERIFIED', 
          slipRef: transRef, 
          verifiedAt: new Date() 
        },
      }),
      prisma.order.update({ 
        where: { orderId }, 
        data: { status: 'COMPLETED' } 
      })
    ])

    logger.payment.slipVerified(paymentId, minecraftName, voucherAmount)
    logger.order.statusChanged(orderId, 'AWAITING_PAYMENT', 'COMPLETED', minecraftName)
    logger.order.completed(orderId, minecraftName, order.total, timer())

    // Send Truewallet-specific Discord notification
    await sendTruewalletLog({
      orderId,
      minecraftName,
      amount: order.total,
      voucherUrl,
      voucherCode: redeemResult.code,
      ownerFullName: redeemResult.ownerFullName,
      items: orderItemsForLog,
      status: 'SUCCESS',
    })

    // Update sold counts
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
      logger.warn('Failed to update some product sold counts', 500)
    }

    // Execute RCON commands
    const orderItems = order.items as OrderItem[]
    const itemsWithCommands = orderItems.filter((item) => item.commands && item.commands.length > 0)
    
    const allCommandsToExecute: string[] = []

    for (const item of itemsWithCommands) {
      for (let i = 0; i < item.quantity; i++) {
        for (const cmd of item.commands) {
          const processedCmd = item.customInput 
            ? replaceCustomInput(cmd, item.customInput)
            : cmd
          allCommandsToExecute.push(processedCmd)
        }
      }
    }

    let deliverySuccess = true
    
    if (allCommandsToExecute.length > 0) {
      try {
        const result = await giveItemsToPlayer(order.minecraftName, allCommandsToExecute)
        
        if (result.success) {
          await prisma.order.update({
            where: { orderId },
            data: { isDelivered: true }
          })
        } else {
          deliverySuccess = false
          // Queue for retry
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
      } catch (e) {
        deliverySuccess = false
        const err = e instanceof Error ? e.message : String(e)
        
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
      }
    } else {
      await prisma.order.update({
        where: { orderId },
        data: { isDelivered: true }
      })
    }

    return NextResponse.json({
      success: true,
      orderId: order.orderId,
      paymentId: payment.paymentId,
      amount: voucherAmount,
      ownerFullName: redeemResult.ownerFullName,
      status: 'COMPLETED',
      delivery: {
        status: deliverySuccess ? 'SUCCESS' : 'QUEUED',
        message: deliverySuccess 
          ? 'ส่งไอเทมเรียบร้อยแล้ว' 
          : 'ไอเทมจะถูกส่งเมื่อคุณออนไลน์'
      }
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Truewallet payment failed: ${errorMessage}`)
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการชำระเงิน' }, { status: 500 })
  }
}
