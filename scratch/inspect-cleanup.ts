import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== Inspecting Orders #213 - #225 ===')
  const orders = await prisma.order.findMany({
    where: {
      orderId: {
        gte: 213,
        lte: 225
      }
    },
    include: {
      payment: true,
      commandQueue: true
    }
  })
  console.log(`Found ${orders.length} orders in range #213 - #225:`)
  orders.forEach(o => {
    console.log(`- Order #${o.orderId} (ID: ${o.id}, Player: ${o.minecraftName}, Status: ${o.status}, Total: ${o.total}, CreatedAt: ${o.createdAt.toISOString()})`)
  })

  console.log('\n=== Inspecting Loma0531 in past 7 days ===')
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const user = await prisma.user.findUnique({
    where: { minecraftName: 'Loma0531' }
  })
  console.log('User Loma0531:', user)

  const lomaOrders = await prisma.order.findMany({
    where: {
      minecraftName: 'Loma0531',
      createdAt: { gte: oneWeekAgo }
    }
  })
  console.log(`Loma0531 Orders in past 7 days: ${lomaOrders.length}`)
  lomaOrders.forEach(o => {
    console.log(`  * Order #${o.orderId} (Total: ${o.total}, Status: ${o.status}, Date: ${o.createdAt.toISOString()})`)
  })

  const lomaPayments = await prisma.payment.findMany({
    where: {
      minecraftName: 'Loma0531',
      createdAt: { gte: oneWeekAgo }
    }
  })
  console.log(`Loma0531 Payments in past 7 days: ${lomaPayments.length}`)

  const lomaCoinTx = await prisma.coinTransaction.findMany({
    where: {
      minecraftName: 'Loma0531',
      createdAt: { gte: oneWeekAgo }
    }
  })
  console.log(`Loma0531 CoinTransactions in past 7 days: ${lomaCoinTx.length}`)
  lomaCoinTx.forEach(tx => {
    console.log(`  * CoinTx (${tx.type}, Amt: ${tx.amount}, Desc: ${tx.description}, Date: ${tx.createdAt.toISOString()})`)
  })

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  prisma.$disconnect()
})
