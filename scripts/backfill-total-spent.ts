/**
 * Migration Script: Backfill User.totalSpent
 * 
 * คำนวณยอดใช้จ่ายรวมจาก Order ที่ COMPLETED ทั้งหมด
 * แล้วอัปเดตลงฟิลด์ totalSpent ของ User
 * 
 * Usage: bun run scripts/backfill-total-spent.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function backfillTotalSpent() {
  console.log('🔄 เริ่มอัปเดต totalSpent สำหรับ User ทั้งหมด...\n')

  // ดึงยอดรวมจาก Order ที่ COMPLETED แยกตาม minecraftName โดยไม่รวมยอดที่จ่ายด้วย Coin
  const spentByUser = await prisma.order.groupBy({
    by: ['minecraftName'],
    where: { 
      status: 'COMPLETED',
      payment: {
        OR: [
          { paymentMethod: { isSet: false } },
          { paymentMethod: { not: 'coin' } }
        ]
      }
    },
    _sum: { total: true },
  })

  console.log(`📊 พบ ${spentByUser.length} คนที่มี Order สถานะ COMPLETED\n`)

  let updatedCount = 0
  let createdCount = 0

  for (const entry of spentByUser) {
    const totalSpent = entry._sum.total || 0
    
    // ใช้ upsert เพื่อสร้าง User ถ้ายังไม่มี
    const user = await prisma.user.upsert({
      where: { minecraftName: entry.minecraftName },
      update: { totalSpent },
      create: { minecraftName: entry.minecraftName, totalSpent },
    })

    if (user.createdAt.getTime() === user.updatedAt.getTime()) {
      createdCount++
      console.log(`  ✨ สร้าง User ใหม่: ${entry.minecraftName} → ${totalSpent.toLocaleString()} ฿`)
    } else {
      updatedCount++
      console.log(`  ✅ อัปเดต: ${entry.minecraftName} → ${totalSpent.toLocaleString()} ฿`)
    }
  }

  console.log(`\n========================================`)
  console.log(`📈 สรุป:`)
  console.log(`   อัปเดตแล้ว: ${updatedCount} คน`)
  console.log(`   สร้างใหม่: ${createdCount} คน`)
  console.log(`   รวมทั้งหมด: ${spentByUser.length} คน`)
  console.log(`========================================\n`)
  console.log('✅ Backfill totalSpent เสร็จสิ้น!')
}

backfillTotalSpent()
  .catch((e) => {
    console.error('❌ เกิดข้อผิดพลาด:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
