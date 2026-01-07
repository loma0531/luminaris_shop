/**
 * Script: Reset Database for Production
 * ล้างข้อมูลทั้งหมดและ reset counters
 * 
 * Usage: bun scripts/reset-database.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function resetDatabase() {
  console.log('⚠️  WARNING: This will DELETE ALL DATA in the database!')
  console.log('Collections to be cleared:')
  console.log('  - Orders')
  console.log('  - Payments')
  console.log('  - Carts')
  console.log('  - CommandQueue')
  console.log('  - Users')
  console.log('  - Counters (order_id, payment_id)')
  console.log('')
  console.log('Products and Categories will be KEPT.')
  console.log('')
  
  // Wait for 3 seconds to allow cancel
  console.log('Starting in 3 seconds... Press Ctrl+C to cancel')
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  console.log('')
  console.log('🗑️  Deleting data...')
  
  try {
    // Delete in order (respect foreign keys)
    const commandQueueResult = await prisma.commandQueue.deleteMany({})
    console.log(`   ✓ CommandQueue: ${commandQueueResult.count} records deleted`)
    
    const ordersResult = await prisma.order.deleteMany({})
    console.log(`   ✓ Orders: ${ordersResult.count} records deleted`)
    
    const paymentsResult = await prisma.payment.deleteMany({})
    console.log(`   ✓ Payments: ${paymentsResult.count} records deleted`)
    
    const cartsResult = await prisma.cart.deleteMany({})
    console.log(`   ✓ Carts: ${cartsResult.count} records deleted`)
    
    const usersResult = await prisma.user.deleteMany({})
    console.log(`   ✓ Users: ${usersResult.count} records deleted`)
    
    // Reset counters
    await prisma.counter.deleteMany({})
    await prisma.counter.createMany({
      data: [
        { name: 'order_id', seq: 0 },
        { name: 'payment_id', seq: 0 },
      ]
    })
    console.log('   ✓ Counters reset to 0')
    
    console.log('')
    console.log('✅ Database reset complete!')
    console.log('')
    console.log('Next order will be #1, next payment will be #1')
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

resetDatabase()
