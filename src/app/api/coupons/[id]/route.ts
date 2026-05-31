import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { isValidObjectId } from '@/lib/inputValidation'
import { logger } from '@/lib/logger'
import * as z from 'zod'

const CouponUpdateSchema = z.object({
  code: z.string().min(1, 'ต้องระบุรหัสคูปอง').max(50),
  discountType: z.enum(['PERCENTAGE', 'FIXED']),
  discountValue: z.number().positive('มูลค่าส่วนลดต้องมากกว่า 0'),
  maxDiscount: z.number().nullable().optional(),
  minSpend: z.number().nonnegative().optional().default(0),
  maxUses: z.number().int().positive().nullable().optional(),
  maxUsesPerUser: z.number().int().positive().optional().default(1),
  isActive: z.boolean().optional().default(true),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAuth(request)
  if (authError) return authError

  try {
    const { id } = await params
    
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'รหัสคูปองไม่ถูกต้อง' }, { status: 400 })
    }

    const json = await request.json()
    const validation = CouponUpdateSchema.safeParse(json)

    if (!validation.success) {
      const errorMsg = validation.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json({ error: `ข้อมูลไม่ถูกต้อง: ${errorMsg}` }, { status: 400 })
    }

    const data = validation.data
    const cleanCode = data.code.trim().toUpperCase()

    // ตรวจสอบว่าคูปองมีอยู่จริง
    const current = await prisma.coupon.findUnique({
      where: { id }
    })

    if (!current) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลคูปองที่ต้องการแก้ไข' }, { status: 404 })
    }

    // ตรวจสอบรหัสคูปองซ้ำกับอันอื่น
    const existing = await prisma.coupon.findFirst({
      where: {
        code: cleanCode,
        id: { not: id }
      }
    })

    if (existing) {
      return NextResponse.json({ error: 'รหัสคูปองนี้มีอยู่ในระบบแล้ว' }, { status: 400 })
    }

    const updated = await prisma.coupon.update({
      where: { id },
      data: {
        code: cleanCode,
        discountType: data.discountType,
        discountValue: data.discountValue,
        maxDiscount: data.maxDiscount !== undefined ? data.maxDiscount : null,
        minSpend: data.minSpend,
        maxUses: data.maxUses !== undefined ? data.maxUses : null,
        maxUsesPerUser: data.maxUsesPerUser,
        isActive: data.isActive,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      }
    })

    logger.debug(`Coupon ${updated.code} updated by admin`)
    return NextResponse.json(updated)
  } catch (error) {
    const err = error as Error
    logger.system.error(`Failed to update coupon: ${err.message}`)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูลคูปอง' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAuth(request)
  if (authError) return authError

  try {
    const { id } = await params

    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'รหัสคูปองไม่ถูกต้อง' }, { status: 400 })
    }

    const current = await prisma.coupon.findUnique({
      where: { id }
    })

    if (!current) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลคูปองที่ต้องการลบ' }, { status: 404 })
    }

    // ดำเนินการลบคูปอง
    await prisma.coupon.delete({
      where: { id }
    })

    // เราไม่ลบประวัติการใช้ CouponUsage อัตโนมัติ เพราะต้องการเก็บบันทึกประวัติเอาไว้ แต่ Prisma relation ใน schema เป็นแบบไม่มี cascade ดังนั้นสามารถลบ Coupon ได้ทันทีหากไม่มี Cascade ปัญหา
    // หรือถ้าหากมี Cascade หรือมีความสัมพันธ์อยู่ ใน Prisma schema ของเรา:
    // model Coupon { usages CouponUsage[] }
    // model CouponUsage { coupon Coupon @relation(fields: [couponId], references: [id]) }
    // และไม่มี onDelete: Cascade! ถ้าหากคูปองถูกนำไปใช้งานแล้ว และมี CouponUsage ในระบบ การ delete coupon โดยตรงอาจจะติด Foreign Key error ในฐานข้อมูลเชิงสัมพันธ์ แต่เนื่องจากนี่เป็น MongoDB (NoSQL) การลบโดยตรงอาจจะสำเร็จ แต่อาจจะปล่อยให้ usages เป็น orphan 
    // เพื่อความปลอดภัยและรอบคอบ: ให้ทำการลบประวัติการใช้งานของคูปองนั้น ๆ ไปด้วย หรือปล่อยให้ Prisma จัดการ
    // เพื่อป้องกัน Database error ในอนาคต ให้ลบ CouponUsage ที่อ้างอิงถึง couponId นี้ออกไปด้วยใน Transaction เดียวกัน หรือลบแยก
    
    await prisma.couponUsage.deleteMany({
      where: { couponId: id }
    })

    logger.debug(`Coupon ${current.code} deleted by admin`)
    return NextResponse.json({ success: true })
  } catch (error) {
    const err = error as Error
    logger.system.error(`Failed to delete coupon: ${err.message}`)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการลบคูปอง' }, { status: 500 })
  }
}
