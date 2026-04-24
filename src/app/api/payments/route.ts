import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { validatePagination } from '@/lib/inputValidation'
import { CACHE_HEADERS } from '@/lib/cacheHeaders'
import { logger, createTimer } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const timer = createTimer()
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = validatePagination(searchParams.get('page'), searchParams.get('limit'), 50)

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        skip, take: limit,
        select: {
          id: true, paymentId: true, minecraftName: true, amount: true, paymentMethod: true,
          stripeSessionId: true, stripePaymentIntentId: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.payment.count(),
    ])

    logger.payment.listViewed(payments.length, timer())

    return NextResponse.json({
      payments, total, page, totalPages: Math.ceil(total / limit),
    }, { headers: CACHE_HEADERS.NONE })
  } catch {
    logger.system.error('Failed to fetch payments')
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}
