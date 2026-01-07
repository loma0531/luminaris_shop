import { PrismaClient } from '@prisma/client'
import { logger } from '@/lib/logger'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['error', 'warn'] 
      : ['error'],
    // Optimization: Connection pool is managed via connection string params (?connection_limit=20)
  })

// Reuse connection in all environments
globalForPrisma.prisma = prisma

// Connect eagerly to reduce first-query latency
// This prewarms the connection pool
const connectionPromise = prisma.$connect()
  .then(() => {
    if (process.env.NODE_ENV === 'development') {
      logger.redis.connected() // Reuse connected log style or create new db one
      logger.info('[Prisma] MongoDB connected successfully', 200)
    }
  })
  .catch((e: Error) => {
    logger.system.error(`[Prisma] MongoDB connection failed: ${e.message}`)
  })

// Export connection promise for health checks
export const waitForConnection = () => connectionPromise

export default prisma
