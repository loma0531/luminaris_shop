import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { logger } from '@/lib/logger'
import * as z from 'zod'

const CouponCreateSchema = z.object({
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

export async function GET(request: NextRequest) {
  const authError = await requireAdminAuth(request)
  if (authError) return authError

  try {
    const coupons = await prisma.coupon.findMany({
      include: {
        usages: {
          orderBy: { usedAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(coupons)
  } catch (error) {
    const err = error as Error
    logger.system.error(`Failed to fetch coupons: ${err.message}`)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลคูปอง' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAdminAuth(request)
  if (authError) return authError

  try {
    const json = await request.json()
    const validation = CouponCreateSchema.safeParse(json)

    if (!validation.success) {
      const errorMsg = validation.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json({ error: `ข้อมูลไม่ถูกต้อง: ${errorMsg}` }, { status: 400 })
    }

    const data = validation.data
    const cleanCode = data.code.trim().toUpperCase()

    // ตรวจสอบคูปองซ้ำ
    const existing = await prisma.coupon.findUnique({
      where: { code: cleanCode }
    })

    if (existing) {
      return NextResponse.json({ error: 'รหัสคูปองนี้มีอยู่ในระบบแล้ว' }, { status: 400 })
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: cleanCode,
        discountType: data.discountType,
        discountValue: data.discountValue,
        maxDiscount: data.maxDiscount || null,
        minSpend: data.minSpend,
        maxUses: data.maxUses || null,
        maxUsesPerUser: data.maxUsesPerUser,
        isActive: data.isActive,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      }
    })

    logger.debug(`Coupon ${coupon.code} created by admin`)
    return NextResponse.json(coupon, { status: 201 })
  } catch (error) {
    const err = error as Error
    logger.system.error(`Failed to create coupon: ${err.message}`)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการสร้างคูปอง' }, { status: 500 })
  }
}
