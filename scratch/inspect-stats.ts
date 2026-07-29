import { PrismaClient } from '@prisma/client'
import { getCache, CACHE_KEYS } from '../src/lib/cache/index'

const prisma = new PrismaClient()

async function main() {
  console.log('=== INSPECTING ALL VERIFIED PAYMENTS IN DB ===')
  const payments = await prisma.payment.findMany({
    where: { status: 'VERIFIED' }
  })
  console.log(`Total VERIFIED payments count in DB: ${payments.length}`)
  payments.forEach(p => {
    console.log(`- Payment #${p.paymentId} (ID: ${p.id}, Player: ${p.minecraftName}, Amt: ${p.amount}, Date: ${p.createdAt.toISOString()})`)
  })

  console.log('\n=== CHECKING STATS AGGREGATION FROM DB ===')
  const totalStats = await prisma.payment.aggregate({
    where: { status: 'VERIFIED' },
    _sum: { amount: true },
    _count: true
  })
  console.log('DB Total Stats:', totalStats)

  console.log('\n=== CHECKING CACHED STATS IN REDIS/MEMORY ===')
  const cache = getCache()
  const cachedStats = await cache.get(CACHE_KEYS.STATS)
  console.log('Cached Stats in CacheAdapter:', cachedStats)

  console.log('\n=== CLEARING STATS CACHE ===')
  await cache.del(CACHE_KEYS.STATS)
  console.log('Stats Cache Invalidated!')

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  prisma.$disconnect()
})
