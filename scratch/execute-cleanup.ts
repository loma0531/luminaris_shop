import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== STARTING DATABASE CLEANUP ===')
  
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  // 1. Find all target orders #213 - #225 or Loma0531 in past 7 days
  const targetOrders = await prisma.order.findMany({
    where: {
      OR: [
        { orderId: { gte: 213, lte: 225 } },
        { minecraftName: 'Loma0531', createdAt: { gte: oneWeekAgo } }
      ]
    }
  })
  const orderDbIds = targetOrders.map(o => o.id)
  const orderSeqIds = targetOrders.map(o => o.orderId)
  console.log(`Targeting ${targetOrders.length} orders for deletion (Order IDs: ${orderSeqIds.join(', ')})`)

  // 2. Delete CommandQueue items linked to these orders
  const deletedCmdQueue = await prisma.commandQueue.deleteMany({
    where: {
      OR: [
        { orderId: { in: orderDbIds } },
        { minecraftName: 'Loma0531', createdAt: { gte: oneWeekAgo } }
      ]
    }
  })
  console.log(`Deleted ${deletedCmdQueue.count} CommandQueue records`)

  // 3. Delete CouponUsage records linked to these orders
  const deletedCouponUsage = await prisma.couponUsage.deleteMany({
    where: {
      OR: [
        { orderId: { in: orderDbIds } },
        { minecraftName: 'Loma0531', usedAt: { gte: oneWeekAgo } }
      ]
    }
  })
  console.log(`Deleted ${deletedCouponUsage.count} CouponUsage records`)

  // 4. Delete Order records #213 - #225 and Loma0531 past 7 days FIRST to clear 1-to-1 Payment relation
  const deletedOrders = await prisma.order.deleteMany({
    where: {
      id: { in: orderDbIds }
    }
  })
  console.log(`Deleted ${deletedOrders.count} Order records`)

  // 5. Delete Payment records for Loma0531 or linked payments in past 7 days
  const deletedPayments = await prisma.payment.deleteMany({
    where: {
      OR: [
        { minecraftName: 'Loma0531', createdAt: { gte: oneWeekAgo } }
      ]
    }
  })
  console.log(`Deleted ${deletedPayments.count} Payment records`)

  // 6. Delete CoinTransaction records for Loma0531 in past 7 days
  const deletedCoinTx = await prisma.coinTransaction.deleteMany({
    where: {
      minecraftName: 'Loma0531',
      createdAt: { gte: oneWeekAgo }
    }
  })
  console.log(`Deleted ${deletedCoinTx.count} CoinTransaction records`)

  // 7. Recalculate totalSpent for Loma0531 from remaining COMPLETED orders
  const remainingCompletedOrders = await prisma.order.findMany({
    where: {
      minecraftName: 'Loma0531',
      status: 'COMPLETED'
    }
  })
  const newTotalSpent = remainingCompletedOrders.reduce((sum, o) => sum + o.total, 0)

  // Update user profile
  const updatedUser = await prisma.user.update({
    where: { minecraftName: 'Loma0531' },
    data: {
      totalSpent: newTotalSpent,
      coins: 0 // Reset test coins balance back to 0 as test transactions were wiped
    }
  })
  console.log(`Updated Loma0531 User profile: totalSpent=${updatedUser.totalSpent}, coins=${updatedUser.coins}`)

  console.log('=== CLEANUP COMPLETED SUCCESSFULLY ===')
  await prisma.$disconnect()
}

main().catch(e => {
  console.error('Error executing cleanup:', e)
  prisma.$disconnect()
  process.exit(1)
})
