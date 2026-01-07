import { Rcon } from 'rcon-client'
import { logger } from '@/lib/logger'

interface RconConfig {
  host: string
  port: number
  password: string
}

interface PlayerSeenResult {
  hasPlayed: boolean
  lastSeen: string | null
  isOnline: boolean
}

const getRconConfig = (): RconConfig => ({
  host: process.env.RCON_HOST || 'localhost',
  port: parseInt(process.env.RCON_PORT || '25575', 10),
  password: process.env.RCON_PASSWORD || '',
})


/**
 * Execute a single RCON command with per-request connection
 * Used for item delivery after purchase (not for login verification)
 */
export async function executeRconCommand(command: string): Promise<string> {
  const config = getRconConfig()
  
  const rcon = await Rcon.connect({
    host: config.host,
    port: config.port,
    password: config.password,
    timeout: 30000, // 30 second timeout for slow servers
  })

  try {
    const response = await rcon.send(command)
    return response || ''
  } finally {
    try {
      await rcon.end()
    } catch {
      // Ignore disconnect errors
    }
  }
}


/**
 * Get player's last seen time using the "seen" command (requires EssentialsX or similar plugin)
 * Returns information about whether the player has ever joined and when they were last seen
 */
export async function getPlayerLastSeen(playerName: string): Promise<PlayerSeenResult> {
  try {
    const response = await executeRconCommand(`seen ${playerName}`)
    
    // Parse the seen response
    // EssentialsX format: "PlayerName was last seen X time ago"
    // Or: "PlayerName is online" if currently online
    // Or: "Player not found" or similar if never joined
    
    const lowerResponse = response.toLowerCase()
    
    // Check if player is currently online
    if (lowerResponse.includes('is online') || lowerResponse.includes('กำลังออนไลน์') ||
        lowerResponse.includes('ได้ online')) {
      return {
        hasPlayed: true,
        lastSeen: 'online',
        isOnline: true,
      }
    }
    
    // Check if player was last seen (has played before)
    // Format: "PlayerName ได้ Offline ตั้งแต่ X time มาแล้ว"
    if (lowerResponse.includes('was last seen') || lowerResponse.includes('last seen') || 
        lowerResponse.includes('ออนไลน์ล่าสุด') || lowerResponse.includes('เข้าล่าสุด') ||
        lowerResponse.includes('ได้ offline ตั้งแต่') || lowerResponse.includes('offline ตั้งแต่')) {
      return {
        hasPlayed: true,
        lastSeen: response,
        isOnline: false,
      }
    }
    
    // Check for errors or not found
    // Format: "Can't find player with this name!"
    if (lowerResponse.includes('never') || lowerResponse.includes('not found') || 
        lowerResponse.includes('unknown') || lowerResponse.includes('ไม่พบ') ||
        lowerResponse.includes('ไม่เคย') || lowerResponse.includes("can't find player") ||
        lowerResponse.includes('cannot find player')) {
      return {
        hasPlayed: false,
        lastSeen: null,
        isOnline: false,
      }
    }
    
    // If response doesn't match any known pattern, assume player doesn't exist
    // This is stricter - we only allow if we're SURE they exist
    logger.debug(`Unknown RCON response for seen command: ${response}`, 200)
    return {
      hasPlayed: false,
      lastSeen: null,
      isOnline: false,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`RCON get player last seen error: ${errorMessage}`, 500)
    throw error
  }
}

/**
 * Verify if a player exists by checking if they have ever joined the server
 */
export async function verifyPlayerExists(playerName: string): Promise<boolean> {
  try {
    const result = await getPlayerLastSeen(playerName)
    return result.hasPlayed
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`RCON verify player exists error: ${errorMessage}`, 500)
    // On error, deny access - don't allow unverified players
    return false
  }
}

/**
 * Execute commands to give items to a player
 * Uses a SINGLE connection for all commands to improve performance
 */
export async function giveItemsToPlayer(playerName: string, commands: string[]): Promise<{ success: boolean; results: string[] }> {
  const results: string[] = []
  let success = true
  const config = getRconConfig()

  let rcon: Rcon | null = null
  try {
    rcon = await Rcon.connect({
      host: config.host,
      port: config.port,
      password: config.password,
      timeout: 30000,
    })

    for (const cmd of commands) {
      try {
        // Replace {player} placeholder with actual player name
        const finalCommand = cmd.replace(/\{player\}/gi, playerName)
        
        // Log the command being sent
        logger.rcon.commandSent(playerName, finalCommand)
        
        const result = await rcon.send(finalCommand)
        
        // Log the response
        logger.rcon.commandResponse(playerName, finalCommand, result)
        logger.rcon.commandSuccess(playerName, finalCommand)
        
        results.push(result)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.rcon.commandFailed(playerName, cmd, errorMessage)
        results.push(`Error: ${error}`)
        success = false
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.rcon.failed(playerName, `Connection failed: ${errorMessage}`)
    return { success: false, results: [`Connection error: ${errorMessage}`] }
  } finally {
    if (rcon) {
      try {
        await rcon.end()
      } catch {
        // Ignore disconnect errors
      }
    }
  }

  return { success, results }
}
