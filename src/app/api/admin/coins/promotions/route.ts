import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const PromotionSchema = z.object({
  name: z.string().min(1, 'กรุณาระบุชื่อโปรโมชั่น'),
  description: z.string().nullable().optional(),
  promoType: z.enum(['MULTIPLIER', 'BONUS_CASH']),
  value: z.number().positive('มูลค่าต้องมากกว่า 0'),
  minSpend: z.number().nonnegative('ยอดใช้จ่ายขั้นต่ำต้องไม่ติดลบ').default(0.0),
  isActive: z.boolean().default(true),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
})

// GET /api/admin/coins/promotions
export async function GET(request: NextRequest) {
  try {
    const authError = await requireAdminAuth(request)
    if (authError) return authError

    const url = new URL(request.url)
    
    const id = url.searchParams.get('id')
    if (id) {
      const promotion = await prisma.coinPromotion.findUnique({
        where: { id },
      })
      if (!promotion) {
        return NextResponse.json({ error: 'ไม่พบโปรโมชั่นที่ต้องการ' }, { status: 404 })
      }
      return NextResponse.json({ promotion })
    }

    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '10')
    const skip = (page - 1) * limit

    const [promotions, total] = await Promise.all([
      prisma.coinPromotion.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.coinPromotion.count(),
    ])

    return NextResponse.json({
      promotions,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
    })
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Failed to get promotions: ${errMessage}`)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลโปรโมชั่น' }, { status: 500 })
  }
}

// POST /api/admin/coins/promotions
export async function POST(request: NextRequest) {
  try {
    const authError = await requireAdminAuth(request)
    if (authError) return authError

    const json = await request.json()
    const validation = PromotionSchema.safeParse(json)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0].message }, { status: 400 })
    }

    const data = validation.data
    const promotion = await prisma.coinPromotion.create({
      data: {
        name: data.name,
        description: data.description || null,
        promoType: data.promoType,
        value: data.value,
        minSpend: data.minSpend,
        isActive: data.isActive,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    })

    logger.info(`Admin created coin promotion: ${promotion.name} (${promotion.id})`)
    return NextResponse.json({ success: true, promotion })
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Failed to create promotion: ${errMessage}`)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการสร้างโปรโมชั่น' }, { status: 500 })
  }
}

// PUT /api/admin/coins/promotions
export async function PUT(request: NextRequest) {
  try {
    const authError = await requireAdminAuth(request)
    if (authError) return authError

    const json = await request.json()
    const { id, ...updateData } = json

    if (!id) {
      return NextResponse.json({ error: 'ไม่พบรหัสโปรโมชั่น' }, { status: 400 })
    }

    const validation = PromotionSchema.partial().safeParse(updateData)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0].message }, { status: 400 })
    }

    const validatedData = validation.data
    const dataToUpdate: any = {}
    if (validatedData.name !== undefined) dataToUpdate.name = validatedData.name
    if (validatedData.description !== undefined) dataToUpdate.description = validatedData.description
    if (validatedData.promoType !== undefined) dataToUpdate.promoType = validatedData.promoType
    if (validatedData.value !== undefined) dataToUpdate.value = validatedData.value
    if (validatedData.minSpend !== undefined) dataToUpdate.minSpend = validatedData.minSpend
    if (validatedData.isActive !== undefined) dataToUpdate.isActive = validatedData.isActive
    if (validatedData.startDate !== undefined) {
      dataToUpdate.startDate = validatedData.startDate ? new Date(validatedData.startDate) : null
    }
    if (validatedData.endDate !== undefined) {
      dataToUpdate.endDate = validatedData.endDate ? new Date(validatedData.endDate) : null
    }

    const promotion = await prisma.coinPromotion.update({
      where: { id },
      data: dataToUpdate,
    })

    logger.info(`Admin updated coin promotion: ${promotion.name} (${promotion.id})`)
    return NextResponse.json({ success: true, promotion })
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Failed to update promotion: ${errMessage}`)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการแก้ไขโปรโมชั่น' }, { status: 500 })
  }
}

// DELETE /api/admin/coins/promotions
export async function DELETE(request: NextRequest) {
  try {
    const authError = await requireAdminAuth(request)
    if (authError) return authError

    const url = new URL(request.url)
    const id = url.searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ไม่พบรหัสโปรโมชั่น' }, { status: 400 })
    }

    await prisma.coinPromotion.delete({
      where: { id },
    })

    logger.info(`Admin deleted coin promotion: ${id}`)
    return NextResponse.json({ success: true })
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Failed to delete promotion: ${errMessage}`)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการลบโปรโมชั่น' }, { status: 500 })
  }
}
