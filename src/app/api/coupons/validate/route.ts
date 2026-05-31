import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getProductActivePrice, isProductOnSale } from '@/lib/productPricing'
import { logger } from '@/lib/logger'
import * as z from 'zod'

const CouponValidateSchema = z.object({
  code: z.string().min(1, 'ต้องกรอกรหัสคูปอง'),
  minecraftName: z.string().min(3, 'ชื่อผู้เล่นไม่ถูกต้อง'),
  items: z.array(z.object({
    productId: z.string().regex(/^[a-fA-F0-9]{24}$/, 'รหัสสินค้าไม่ถูกต้อง'),
    quantity: z.number().min(1).int(),
  })).min(1, 'ต้องมีสินค้าในตะกร้า'),
})

export async function POST(request: NextRequest) {
  try {
    const json = await request.json()
    const validation = CouponValidateSchema.safeParse(json)
    
    if (!validation.success) {
      return NextResponse.json({ error: 'ข้อมูลที่ส่งมาไม่ถูกต้องครบถ้วน' }, { status: 400 })
    }

    const { code, minecraftName, items } = validation.data
    const cleanCode = code.trim().toUpperCase()

    // 1. ค้นหาคูปองในฐานข้อมูล
    const coupon = await prisma.coupon.findUnique({
      where: { code: cleanCode }
    })

    if (!coupon) {
      return NextResponse.json({ error: 'ไม่พบรหัสคูปองนี้' }, { status: 404 })
    }

    // 2. ตรวจสอบว่าคูปองเปิดใช้งานอยู่หรือไม่
    if (!coupon.isActive) {
      return NextResponse.json({ error: 'คูปองนี้ถูกปิดใช้งานแล้ว' }, { status: 400 })
    }

    const now = new Date()

    // 3. ตรวจสอบเงื่อนไขเวลาเริ่มต้นคูปอง
    if (coupon.startDate && now < new Date(coupon.startDate)) {
      return NextResponse.json({ error: 'คูปองนี้ยังไม่เริ่มเปิดใช้งาน' }, { status: 400 })
    }

    // 4. ตรวจสอบเงื่อนไขวันหมดอายุคูปอง
    if (coupon.endDate && now > new Date(coupon.endDate)) {
      return NextResponse.json({ error: 'คูปองนี้หมดอายุการใช้งานแล้ว' }, { status: 400 })
    }

    // 5. ตรวจสอบโควตาคูปองทั้งหมด (maxUses)
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ error: 'สิทธิ์คูปองนี้เต็มเรียบร้อยแล้ว' }, { status: 400 })
    }

    // 6. ตรวจสอบสิทธิ์การใช้งานต่อคน (maxUsesPerUser)
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

    // 7. ดึงราคาสินค้าจากฐานข้อมูลมาคำนวณยอดเงินรวม (Subtotal) แบบปลอดภัย ป้องกันการแฮกราคาจากหน้าเว็บ
    const productIds = items.map(item => item.productId)
    const dbProducts = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      }
    })

    const productMap = new Map(dbProducts.map(p => [p.id, p]))
    let secureSubtotal = 0 // ยอดเงินทั้งหมดที่ต้องชำระ (ก่อนใช้คูปอง แต่รวมราคาโปรโมชันแล้ว)
    let eligibleSubtotal = 0 // ยอดเงินที่สามารถนำคูปองมาใช้เป็นส่วนลดเพิ่มได้ (เฉพาะสินค้าปกติที่ไม่ได้จัดโปรโมชัน)
    let discountItemsCount = 0 // นับจำนวนสินค้าที่กำลังจัดโปรโมชันอยู่

    for (const item of items) {
      const dbProduct = productMap.get(item.productId)
      if (!dbProduct) {
        return NextResponse.json({ error: 'สินค้าบางชิ้นในตะกร้าไม่ถูกต้องหรือไม่มีขายแล้ว' }, { status: 400 })
      }

      // คำนวณราคาปัจจุบันของสินค้า (โดยคิดลดราคาโปรโมชันด้วย)
      const currentActivePrice = getProductActivePrice(dbProduct)
      const itemTotalPrice = currentActivePrice * item.quantity
      secureSubtotal += itemTotalPrice

      // ตรวจสอบว่าสินค้าชิ้นนี้กำลังลดราคาจัดโปรโมชันอยู่หรือไม่
      if (isProductOnSale(dbProduct)) {
        discountItemsCount += 1
      }
      eligibleSubtotal += itemTotalPrice
    }

    // 9. ตรวจสอบยอดซื้อขั้นต่ำ
    if (secureSubtotal < coupon.minSpend) {
      return NextResponse.json({ 
        error: `ยอดซื้อยังไม่ถึงเกณฑ์ขั้นต่ำสำหรับใช้คูปองนี้ (ต้องการอีก ฿${(coupon.minSpend - secureSubtotal).toFixed(2)})` 
      }, { status: 400 })
    }

    // 10. คำนวณยอดส่วนลดสุทธิ (เฉพาะจากยอดสินค้าที่ร่วมรายการ)
    let discountAmount = 0
    if (coupon.discountType === 'PERCENTAGE') {
      discountAmount = eligibleSubtotal * (coupon.discountValue / 100)
      
      // ตรวจสอบส่วนลดสูงสุด (maxDiscount)
      if (coupon.maxDiscount !== null && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount
      }
    } else if (coupon.discountType === 'FIXED') {
      discountAmount = coupon.discountValue
    }

    // ป้องกันไม่ให้ส่วนลดมากกว่ายอดเงินทั้งหมดของสินค้าที่ร่วมรายการ
    const finalDiscountAmount = Math.min(discountAmount, eligibleSubtotal)
    
    // คำนวณราคาสรุปสุดท้ายโดยประกันว่าจะต้องมีมูลค่าอย่างน้อย 1 บาท เพื่อให้ระบบสามารถสร้างรายการสั่งซื้อและชำระเงินได้
    const finalTotal = Math.max(1, secureSubtotal - finalDiscountAmount)
    const exactDiscountAmount = secureSubtotal - finalTotal

    return NextResponse.json({
      success: true,
      couponId: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount: exactDiscountAmount,
      subtotal: secureSubtotal,
      finalTotal: finalTotal,
      maxDiscount: coupon.maxDiscount,
    })
  } catch (error) {
    const err = error as Error
    logger.system.error(`Error validating coupon: ${err.message}`)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบคูปอง' }, { status: 500 })
  }
}
