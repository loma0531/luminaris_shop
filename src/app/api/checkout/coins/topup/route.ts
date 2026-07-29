import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireUserAuth } from '@/lib/adminAuth'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rateLimit'
import { getNextSequence } from '@/lib/counter'
import { isValidMinecraftName } from '@/lib/inputValidation'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { minecraftName } = body
    const amount = parseFloat(body.amount)

    if (!minecraftName || !isValidMinecraftName(minecraftName)) {
      return NextResponse.json({ error: 'ชื่อ Minecraft ไม่ถูกต้อง' }, { status: 400 })
    }

    if (isNaN(amount) || amount < 10) {
      return NextResponse.json({ error: 'ยอดเติมเงินขั้นต่ำคือ 10 บาท' }, { status: 400 })
    }

    // ตรวจสิทธิ์ — ต้องเป็นเจ้าของบัญชีที่จะเติมเงิน
    const authError = await requireUserAuth(request, minecraftName)
    if (authError) {
      logger.security.accessDenied(`TopUp ${minecraftName}`, 'Coin top-up without ownership')
      return authError
    }

    // Rate limiting เพื่อป้องกัน spam เติมเงิน (5 requests per minute)
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const rateLimitResult = await rateLimit(`coin-topup-request:${ip}`, {
      limit: 5,
      windowMs: 60000,
    })
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'ส่งคำขอมากเกินไป กรุณารอสักครู่' },
        { status: 429 }
      )
    }

    // โหลด settings coin_rate
    const settings = await prisma.settings.findMany({
      where: {
        key: { in: ['coin_rate'] }
      }
    })
    const map = new Map(settings.map(s => [s.key, s.value]))
    const coinRate = parseFloat(map.get('coin_rate') || '1.0')

    // ดึงโปรโมชั่นที่กำลัง active ณ ปัจจุบัน
    const now = new Date()
    const activePromos = await prisma.coinPromotion.findMany({
      where: {
        isActive: true,
        OR: [
          { startDate: null, endDate: null },
          { startDate: { lte: now }, endDate: null },
          { startDate: null, endDate: { gte: now } },
          { startDate: { lte: now }, endDate: { gte: now } }
        ]
      }
    })

    // คำนวณตัวคูณโบนัสสะสม (Multiplier)
    const multiplierPromos = activePromos.filter(p => p.promoType === 'MULTIPLIER')
    let totalMultiplier = 1.0
    for (const p of multiplierPromos) {
      totalMultiplier = totalMultiplier * p.value
    }

    let coinsEarned = amount * coinRate * totalMultiplier

    // คำนวณโบนัสเพิ่ม (Bonus Cash)
    const bonusPromos = activePromos.filter(p => p.promoType === 'BONUS_CASH')
    for (const p of bonusPromos) {
      if (p.minSpend > 0 && amount >= p.minSpend) {
        coinsEarned += p.value
      }
    }

    // สร้าง ID ลำดับสำหรับ Order และ Payment
    const orderSeqId = await getNextSequence('order_id')
    const paymentSeqId = await getNextSequence('payment_id')

    // สร้างทั้ง Payment และ Order ใน Interactive Transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. สร้าง Payment
      const payment = await tx.payment.create({
        data: {
          paymentId: paymentSeqId,
          minecraftName,
          amount,
          status: 'PENDING',
          isTopUp: true,
          coinsEarned,
        }
      })

      // 2. สร้าง Order ชั่วคราวสำหรับการเติมเงิน
      const order = await tx.order.create({
        data: {
          orderId: orderSeqId,
          minecraftName,
          total: amount,
          status: 'AWAITING_PAYMENT',
          isTopUp: true,
          paymentId: payment.id,
          items: [{
            productId: '636f696e746f707570303031', // placeholder ObjectId for Coin Topup
            name: `เติม Coin สะสม (${coinsEarned} Coin)`,
            price: amount,
            quantity: 1,
            commands: [],
          }]
        }
      })

      return { order, payment }
    })

    logger.info(`TopUp Order created: orderId=${result.order.orderId}, paymentId=${result.payment.paymentId} for ${minecraftName} (${amount}฿ → ${coinsEarned} Coins)`)

    return NextResponse.json({
      success: true,
      orderId: result.order.orderId,
      paymentId: result.payment.paymentId,
      amount,
      coinsEarned,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Coin top-up order generation failed: ${errorMessage}`)
    return NextResponse.json({ error: 'ไม่สามารถสร้างคำสั่งซื้อสำหรับเติมเงินได้' }, { status: 500 })
  }
}
