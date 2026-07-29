import { getCache, CACHE_KEYS } from '../src/lib/cache/index'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== CLEARING ALL REDIS AND IN-MEMORY CACHES ===')
  const cache = getCache()
  
  await Promise.all([
    cache.del(CACHE_KEYS.PRODUCTS),
    cache.del(CACHE_KEYS.CATEGORIES),
    cache.del(CACHE_KEYS.STATS),
    cache.del(CACHE_KEYS.CART('Loma0531')),
  ])

  console.log('Caches cleared via CacheAdapter!')

  console.log('\n=== STATS DATA IN DATABASE (CURRENT) ===')
  const [totalStats, leaderboardData, recentTransactions] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: 'VERIFIED' },
      _sum: { amount: true },
      _count: true
    }),
    prisma.payment.groupBy({
      by: ['minecraftName'],
      where: { status: 'VERIFIED' },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
      take: 10
    }),
    prisma.payment.findMany({
      where: { status: 'VERIFIED' },
      select: {
        minecraftName: true,
        amount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    })
  ])

  console.log('Total verified amount:', totalStats._sum.amount || 0)
  console.log('Total verified count:', totalStats._count)
  console.log('Leaderboard:', leaderboardData)
  console.log('Recent 5 transactions:', recentTransactions.slice(0, 5))

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  prisma.$disconnect()
})
