import { invalidateProductCache, invalidateCategoryCache } from '../src/lib/redis'
import { getRedis } from '../src/lib/redis'

async function main() {
  console.log('Clearing cache...')
  await invalidateProductCache()
  await invalidateCategoryCache()
  console.log('Cache cleared.')
  process.exit(0)
}

main().catch(console.error)
