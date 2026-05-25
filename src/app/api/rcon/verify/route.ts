import { NextRequest, NextResponse } from 'next/server'
import { verifyPlayerInDatabase, testMySQLConnection } from '@/lib/mysql'
import { requireAdminAuth } from '@/lib/adminAuth'
import { isValidMinecraftName } from '@/lib/inputValidation'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { playerName, action } = body

    if (action === 'test') {
      const authError = await requireAdminAuth(request)
      if (authError) return authError

      const connected = await testMySQLConnection()
      logger.debug(`MySQL connection test: ${connected ? 'success' : 'failed'}`, 200)
      return NextResponse.json({ success: connected })
    }

    if (!playerName) {
      return NextResponse.json({ error: 'Player name is required' }, { status: 400 })
    }

    // Validate player name format
    if (!isValidMinecraftName(playerName)) {
      logger.security.invalidInput('playerName', playerName)
      return NextResponse.json({ error: 'Invalid player name format' }, { status: 400 })
    }

    // Check if player exists in CMI_users database
    const result = await verifyPlayerInDatabase(playerName)
    
    logger.debug(`Player verification: ${playerName} - ${result.exists ? 'found' : 'not found'}`, 200)
    
    return NextResponse.json({
      success: true,
      playerName,
      hasPlayed: result.exists,
    })
  } catch {
    logger.system.error('Failed to verify player')
    return NextResponse.json(
      { success: false, error: 'Cannot connect to database' },
      { status: 500 }
    )
  }
}
