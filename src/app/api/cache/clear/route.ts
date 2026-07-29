import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/adminAuth'
import { invalidateProductCache, invalidateCategoryCache, invalidateStatsCache } from '@/lib/redis'
import { logger } from '@/lib/logger'

/**
 * POST /api/cache/clear
 * Clear all Redis caches (admin only)
 * Use this after database reset or when cache is stale
 */
export async function POST(request: NextRequest) {
  const authError = await requireAdminAuth(request)
  if (authError) return authError

  try {
    await Promise.all([
      invalidateProductCache(),
      invalidateCategoryCache(),
      invalidateStatsCache(),
    ])
    
    logger.debug('All caches cleared by admin')
    
    return NextResponse.json({ 
      success: true,
      message: 'All caches cleared successfully' 
    })
  } catch (error) {
    logger.system.error(`Failed to clear cache: ${error}`)
    return NextResponse.json(
      { error: 'Failed to clear cache' }, 
      { status: 500 }
    )
  }
}
