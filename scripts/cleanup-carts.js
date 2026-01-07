const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Cleaning up duplicate carts...')
  
  const carts = await prisma.cart.findMany({
    orderBy: { updatedAt: 'desc' },
  })
  
  const seen = new Set()
  const toDelete = []
  
  for (const cart of carts) {
    if (seen.has(cart.minecraftName)) {
      toDelete.push(cart.id)
    } else {
      seen.add(cart.minecraftName)
    }
  }
  
  if (toDelete.length > 0) {
    console.log(`Deleting ${toDelete.length} duplicate carts...`)
    await prisma.cart.deleteMany({
      where: {
        id: { in: toDelete },
      },
    })
  } else {
    console.log('No duplicates found.')
  }
  
  console.log('Done.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
