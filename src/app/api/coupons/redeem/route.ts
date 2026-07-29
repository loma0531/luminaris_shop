import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { MinecraftNameSchema } from '@/lib/schemas'
import { logger } from '@/lib/logger'
import * as z from 'zod'

const RedeemCouponSchema = z.object({
  minecraftName: MinecraftNameSchema,
  code: z.string().min(1, 'กรุณากรอกรหัสคูปอง').max(50),
})

export async function POST(request: NextRequest) {
  try {
    const json = await request.json()
    const validation = RedeemCouponSchema.safeParse(json)

    if (!validation.success) {
      const errorMsg = validation.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json({ error: `ข้อมูลไม่ถูกต้อง: ${errorMsg}` }, { status: 400 })
    }

    const { minecraftName, code } = validation.data
    const cleanCode = code.trim().toUpperCase()

    // 1. ค้นหาคูปอง
    const coupon = await prisma.coupon.findUnique({
      where: { code: cleanCode }
    })

    if (!coupon) {
      return NextResponse.json({ error: 'ไม่พบรหัสคูปองนี้' }, { status: 404 })
    }

    // 2. ตรวจสอบประเภทคูปองว่าต้องเป็น COIN
    if (coupon.discountType !== 'COIN') {
      return NextResponse.json({ 
        error: 'คูปองนี้ไม่ใช่อยู่ในรูปแบบแลก Coin (เป็นคูปองส่วนลดซื้อสินค้าในตะกร้า)' 
      }, { status: 400 })
    }

    // 3. ตรวจสอบสถานะการเปิดใช้งาน
    if (!coupon.isActive) {
      return NextResponse.json({ error: 'คูปองนี้ถูกปิดใช้งานแล้ว' }, { status: 400 })
    }

    const now = new Date()

    // 4. ตรวจสอบวันเริ่มใช้งาน
    if (coupon.startDate && now < new Date(coupon.startDate)) {
      return NextResponse.json({ error: 'คูปองนี้ยังไม่ถึงระยะเวลาเริ่มใช้งาน' }, { status: 400 })
    }

    // 5. ตรวจสอบวันหมดอายุ
    if (coupon.endDate && now > new Date(coupon.endDate)) {
      return NextResponse.json({ error: 'คูปองนี้หมดอายุการใช้งานแล้ว' }, { status: 400 })
    }

    // 6. ตรวจสอบโควตารวมทั้งหมด (maxUses)
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ error: 'สิทธิ์การใช้งานคูปองนี้เต็มเรียบร้อยแล้ว' }, { status: 400 })
    }

    // 7. ตรวจสอบสิทธิ์การใช้งานต่อคน (maxUsesPerUser)
    const usageCount = await prisma.couponUsage.count({
      where: {
        couponId: coupon.id,
        minecraftName: minecraftName,
      }
    })

    if (usageCount >= coupon.maxUsesPerUser) {
      return NextResponse.json({ 
        error: `คุณเคยใช้งานคูปองนี้ไปแล้ว (จำกัด ${coupon.maxUsesPerUser} ครั้งต่อบัญชี)` 
      }, { status: 400 })
    }

    const coinsToAdd = coupon.discountValue

    // 8. ดำเนินการเพิ่ม Coin และบันทึกประวัติการใช้งานแบบ Atomic Transaction
    const result = await prisma.$transaction(async (tx) => {
      // 8.1 อัปเดต/สร้างข้อมูลผู้ใช้และเพิ่ม Coin
      const updatedUser = await tx.user.upsert({
        where: { minecraftName },
        update: {
          coins: { increment: coinsToAdd }
        },
        create: {
          minecraftName,
          coins: coinsToAdd,
        }
      })

      // 8.2 บันทึกประวัติธุรกรรม Coin
      await tx.coinTransaction.create({
        data: {
          minecraftName,
          amount: coinsToAdd,
          type: 'COIN_COUPON',
          description: `แลกรับ ${coinsToAdd.toLocaleString()} Coin จากคูปอง ${coupon.code}`,
        }
      })

      // 8.3 เพิ่มจำนวน usedCount ของคูปอง
      await tx.coupon.update({
        where: { id: coupon.id },
        data: {
          usedCount: { increment: 1 }
        }
      })

      // 8.4 บันทึกประวัติ CouponUsage
      await tx.couponUsage.create({
        data: {
          couponId: coupon.id,
          minecraftName,
          orderId: null,
          discountedAmt: coinsToAdd,
        }
      })

      return updatedUser
    })

    logger.debug(`User ${minecraftName} redeemed coin coupon ${coupon.code} (+${coinsToAdd} coins)`)

    return NextResponse.json({
      success: true,
      coinsEarned: coinsToAdd,
      newBalance: result.coins,
      message: `แลกรับ ${coinsToAdd.toLocaleString()} Coin เรียบร้อยแล้ว!`,
    })

  } catch (error) {
    const err = error as Error
    logger.system.error(`Error redeeming coin coupon: ${err.message}`)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการแลกคูปอง' }, { status: 500 })
  }
}
