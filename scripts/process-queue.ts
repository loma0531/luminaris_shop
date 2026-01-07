#!/usr/bin/env bun
/**
 * Command Queue Processor Script
 * ใช้สำหรับ run เป็น background job หรือ cron
 * 
 * Usage: bun scripts/process-queue.ts [--once] [--interval=5000]
 */

import { processCommandQueue, getQueueStats } from '../src/lib/queue-worker'

const args = process.argv.slice(2)
const runOnce = args.includes('--once')
const intervalArg = args.find(a => a.startsWith('--interval='))
const interval = intervalArg ? parseInt(intervalArg.split('=')[1]) : 5000

async function main() {
  console.log('🚀 Command Queue Processor Started')
  console.log(`   Mode: ${runOnce ? 'Single run' : 'Continuous'}`)
  if (!runOnce) {
    console.log(`   Interval: ${interval}ms`)
  }
  console.log('')

  const processOnce = async () => {
    try {
      const stats = await getQueueStats()
      console.log(`📊 Queue Stats: Pending=${stats.pending}, Processing=${stats.processing}, Completed=${stats.completed}, Failed=${stats.failed}`)
      
      if (stats.pending > 0 || stats.processing > 0) {
        const result = await processCommandQueue()
        console.log(`✅ Processed: ${result.processed}, Succeeded: ${result.succeeded}, Failed: ${result.failed}`)
      } else {
        console.log('💤 No commands to process')
      }
    } catch (error) {
      console.error('❌ Error:', error)
    }
  }

  if (runOnce) {
    await processOnce()
    process.exit(0)
  }

  // Continuous mode
  const runLoop = async () => {
    while (true) {
      await processOnce()
      await new Promise(resolve => setTimeout(resolve, interval))
    }
  }

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...')
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('\n👋 Shutting down...')
    process.exit(0)
  })

  await runLoop()
}

main().catch(console.error)
