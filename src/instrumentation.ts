// Extend global namespace for RCON worker interval
declare global {
  var __rconWorkerInterval: NodeJS.Timeout | undefined
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only run on server-side nodejs runtime
    const { logger } = await import('@/lib/logger')
    logger.info('[Instrumentation] Registering background workers...', 200)

    // Dynamic import to avoid bundling issues
    const { processCommandQueue } = await import('@/lib/queue-worker')

    // Run immediately on startup
    processCommandQueue().catch(err => logger.error(`[Instrumentation] Queue error: ${err}`))

    // Set interval to run every 1 minute (60 * 1000 ms)
    // Using global to prevent multiple intervals in hot-reload (dev mode)
    if (!global.__rconWorkerInterval) {
      global.__rconWorkerInterval = setInterval(() => {
        processCommandQueue().catch(e => {
            logger.error(`[RCON Worker Error]: ${e}`)
        })
      }, 60 * 1000)
      
      logger.info('[Instrumentation] RCON Worker started (Interval: 1m)', 200)
    }
  }
}
