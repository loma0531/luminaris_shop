import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { getNextSequence } from '@/lib/counter'
import { logger, createTimer } from '@/lib/logger'
import { z } from 'zod'
import { verifyPlayerInDatabase } from '@/lib/mysql'

// Zod Schema for Admin Manual Order
const AdminOrderItemSchema = z.object({
  productId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid product ID'),
  name: z.string().min(1, 'Item name is required'),
  price: z.number().min(0, 'Price must be >= 0'),
  quantity: z.number().int().min(1).max(99),
  commands: z.array(z.string()).optional().default([]),
})

const AdminOrderSchema = z.object({
  minecraftName: z.string()
    .min(3, 'Name too short')
    .max(16, 'Name too long')
    .regex(/^[a-zA-Z0-9_]+$/, 'Invalid Minecraft name'),
  items: z.array(AdminOrderItemSchema).min(1, 'At least one item required'),
  total: z.number().min(0, 'Total must be >= 0'),
  note: z.string().max(500).optional(),
})

/**
 * POST /api/admin/orders
 * สร้างออเดอร์จากหลังบ้าน (เสกข้อมูล)
 * ออเดอร์จะถูก mark เป็น COMPLETED ทันที พร้อมอัปเดตสถิติทั้งหมด
 */
export async function POST(request: NextRequest) {
  const timer = createTimer()
  
  // Admin auth required
  const authError = await requireAdminAuth(request)
  if (authError) return authError

  try {
    const json = await request.json()

    // Validate with Zod
    const validation = AdminOrderSchema.safeParse(json)
    if (!validation.success) {
      const errorMsg = validation.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json({ error: `Validation error: ${errorMsg}` }, { status: 400 })
    }

    const { minecraftName, items, total, note } = validation.data

    // ค้นหาชื่อจริงที่สะกดถูกต้องจาก MySQL (เพื่อทำ Case Normalization)
    const playerCheck = await verifyPlayerInDatabase(minecraftName)
    const officialMinecraftName = playerCheck.exists && playerCheck.playerData 
      ? playerCheck.playerData.username 
      : minecraftName

    // Verify total matches item sum
    const calculatedTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    if (Math.abs(calculatedTotal - total) > 1) {
      return NextResponse.json({ 
        error: `Total mismatch: expected ${calculatedTotal}, got ${total}` 
      }, { status: 400 })
    }

    // Generate sequence IDs
    const orderSeqId = await getNextSequence('order_id')
    const paymentSeqId = await getNextSequence('payment_id')

    // Prepare order items (with commands if any)
    const orderItems = items.map(item => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      commands: item.commands || [],
    }))

    // Create Payment (VERIFIED immediately) + Order (COMPLETED immediately)
    // + Update User totalSpent atomically
    const payment = await prisma.payment.create({
      data: {
        paymentId: paymentSeqId,
        minecraftName: officialMinecraftName,
        amount: calculatedTotal,
        status: 'VERIFIED',
        paymentMethod: 'admin',
        stripePaymentIntentId: `ADMIN-${Date.now()}`,
        verifiedAt: new Date(),
      },
    })

    const order = await prisma.order.create({
      data: {
        orderId: orderSeqId,
        minecraftName: officialMinecraftName,
        total: calculatedTotal,
        status: 'COMPLETED',
        paymentId: payment.id,
        items: orderItems,
        isDelivered: true,
      },
    })

    // Update User totalSpent (upsert in case user doesn't exist yet)แบบ Case-Insensitive
    const existingUser = await prisma.user.findFirst({
      where: {
        minecraftName: {
          equals: officialMinecraftName,
          mode: 'insensitive'
        }
      }
    })

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { totalSpent: { increment: calculatedTotal } },
      })
    } else {
      await prisma.user.create({
        data: { 
          minecraftName: officialMinecraftName, 
          totalSpent: calculatedTotal,
          coins: 0.0
        },
      })
    }

    // Update product sold counts
    try {
      await prisma.$transaction(
        items.map(item =>
          prisma.product.update({
            where: { id: item.productId },
            data: { soldCount: { increment: item.quantity } },
          })
        )
      )
    } catch {
      logger.warn('Failed to update some product sold counts for admin order', 500)
    }

    logger.info(`Admin created manual order #${orderSeqId} for ${officialMinecraftName} (${calculatedTotal}฿)${note ? ` - Note: ${note}` : ''}`, 201, timer())

    return NextResponse.json({
      success: true,
      orderId: order.orderId,
      paymentId: payment.paymentId,
      total: calculatedTotal,
      minecraftName: officialMinecraftName,
      status: 'COMPLETED',
      note: note || null,
    }, { status: 201 })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Failed to create admin order: ${errorMessage}`)
    return NextResponse.json({ error: 'Failed to create admin order' }, { status: 500 })
  }
}
