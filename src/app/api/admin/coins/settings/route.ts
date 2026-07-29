import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authError = await requireAdminAuth(request)
  if (authError) return authError

  try {
    const settings = await prisma.settings.findMany({
      where: {
        key: { in: ['coin_rate'] }
      }
    })
    const map = new Map(settings.map(s => [s.key, s.value]))
    
    return NextResponse.json({
      coinRate: parseFloat(map.get('coin_rate') || '1.0'),
    })
  } catch (error) {
    logger.system.error(`Failed to get coin settings: ${error}`)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAdminAuth(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const coinRate = parseFloat(body.coinRate)

    if (isNaN(coinRate) || coinRate <= 0) {
      return NextResponse.json({ error: 'อัตราแลกเปลี่ยนต้องเป็นตัวเลขที่มากกว่า 0' }, { status: 400 })
    }

    await prisma.settings.upsert({
      where: { key: 'coin_rate' },
      update: { value: String(coinRate) },
      create: { key: 'coin_rate', value: String(coinRate) }
    })

    logger.info('Coin rate settings updated by admin')
    return NextResponse.json({ success: true })
  } catch (error) {
    logger.system.error(`Failed to save coin settings: ${error}`)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
