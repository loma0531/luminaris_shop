import { NextRequest, NextResponse } from 'next/server'
import { getPlayerProfile } from '@/lib/mysql'
import { requireUserAuth } from '@/lib/adminAuth'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const { minecraftName } = await request.json()

    if (!minecraftName) {
      return NextResponse.json({ error: 'minecraftName is required' }, { status: 400 })
    }

    const authError = requireUserAuth(request, minecraftName)
    if (authError) return authError

    const profile = await getPlayerProfile(minecraftName)

    if (!profile) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    return NextResponse.json({ profile })
  } catch {
    logger.system.error('Failed to fetch profile')
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}
