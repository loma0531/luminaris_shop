import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== CHECKING ALL LOMA0531 RECORDS IN DB ===')
  
  const user = await prisma.user.findUnique({
    where: { minecraftName: 'Loma0531' }
  })
  console.log('User Loma0531:', user)

  const orders = await prisma.order.findMany({
    where: { minecraftName: 'Loma0531' }
  })
  console.log(`Loma0531 Orders count: ${orders.length}`)
  orders.forEach(o => {
    console.log(` - Order #${o.orderId} (Status: ${o.status}, Total: ${o.total}, Date: ${o.createdAt.toISOString()})`)
  })

  const payments = await prisma.payment.findMany({
    where: { minecraftName: 'Loma0531' }
  })
  console.log(`Loma0531 Payments count: ${payments.length}`)
  payments.forEach(p => {
    console.log(` - Payment #${p.paymentId} (Status: ${p.status}, Amt: ${p.amount}, Date: ${p.createdAt.toISOString()})`)
  })

  const coinTx = await prisma.coinTransaction.findMany({
    where: { minecraftName: 'Loma0531' }
  })
  console.log(`Loma0531 CoinTx count: ${coinTx.length}`)
  coinTx.forEach(tx => {
    console.log(` - CoinTx (${tx.type}, Amt: ${tx.amount}, Date: ${tx.createdAt.toISOString()})`)
  })

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  prisma.$disconnect()
})
