import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminAuth } from '@/lib/adminAuth'
import { logger } from '@/lib/logger'
import { isValidMinecraftName } from '@/lib/inputValidation'
import { verifyPlayerInDatabase } from '@/lib/mysql'
import { sendCoinTransactionLog } from '@/lib/webhook'

export async function POST(request: NextRequest) {
  const authError = await requireAdminAuth(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { minecraftName, description } = body
    const amount = parseFloat(body.amount)

    if (!minecraftName || !isValidMinecraftName(minecraftName)) {
      return NextResponse.json({ error: 'ชื่อ Minecraft ไม่ถูกต้อง' }, { status: 400 })
    }

    if (isNaN(amount) || amount === 0) {
      return NextResponse.json({ error: 'จำนวนเหรียญต้องไม่ใช่ 0 และต้องเป็นตัวเลข' }, { status: 400 })
    }

    // ค้นหาชื่อจริงที่สะกดถูกต้องจาก MySQL (เพื่อทำ Case Normalization)
    const playerCheck = await verifyPlayerInDatabase(minecraftName)
    const officialMinecraftName = playerCheck.exists && playerCheck.playerData 
      ? playerCheck.playerData.username 
      : minecraftName

    // ค้นหายอดเหรียญปัจจุบันของผู้เล่นโดยใช้ชื่อที่สะกดอย่างเป็นทางการแบบ Case-Insensitive
    const user = await prisma.user.findFirst({
      where: {
        minecraftName: {
          equals: officialMinecraftName,
          mode: 'insensitive'
        }
      }
    })

    const targetMinecraftName = user ? user.minecraftName : officialMinecraftName
    const currentCoins = user?.coins || 0.0
    if (currentCoins + amount < 0) {
      return NextResponse.json({ error: `ยอดเหรียญสะสมของผู้เล่นมีไม่เพียงพอที่จะหักออก (มีอยู่: ${currentCoins} Coin, ต้องการหัก: ${Math.abs(amount)} Coin)` }, { status: 400 })
    }

    const transactionType = amount > 0 ? 'ADMIN_ADD' : 'ADMIN_REMOVE'

    await prisma.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { minecraftName: targetMinecraftName },
        update: { coins: { increment: amount } },
        create: {
          minecraftName: targetMinecraftName,
          coins: amount >= 0 ? amount : 0,
        }
      })

      await tx.coinTransaction.create({
        data: {
          minecraftName: officialMinecraftName,
          amount,
          type: transactionType,
          description: description || (amount > 0 ? 'แอดมินเสกเหรียญให้' : 'แอดมินหักเหรียญ'),
        }
      })
    })

    // ส่งข้อมูลธุรกรรมไปยัง Discord
    sendCoinTransactionLog({
      minecraftName: officialMinecraftName,
      amount,
      type: transactionType,
      description: description || undefined,
      newBalance: currentCoins + amount
    }).catch(() => {})

    logger.info(`Admin performed coin action for ${officialMinecraftName}: ${amount} coins.`)
    return NextResponse.json({ success: true, newBalance: currentCoins + amount })
  } catch (error) {
    logger.system.error(`Failed to give/deduct coins: ${error}`)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการดำเนินการ' }, { status: 500 })
  }
}
