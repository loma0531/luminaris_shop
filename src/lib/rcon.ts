import { Rcon } from 'rcon-client'
import { logger } from '@/lib/logger'
import { isValidMinecraftName } from '@/lib/inputValidation'

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

// Connection pool configuration
const RCON_CONFIG = {
  maxIdleTime: 30000,      // Close idle connections after 30 seconds
  connectionTimeout: 30000, // 30 second connection timeout
  maxRetries: 3,           // Max reconnection attempts
}

// Connection pool state
let pooledConnection: Rcon | null = null
let lastUsed: number = 0
let connectionPromise: Promise<Rcon> | null = null

/**
 * Get a pooled RCON connection (reuses existing if available)
 */
async function getPooledConnection(): Promise<Rcon> {
  const now = Date.now()
  
  // Return existing connection if still valid
  if (pooledConnection && (now - lastUsed) < RCON_CONFIG.maxIdleTime) {
    // The connection is alive as long as it hasn't emitted 'end'
    return pooledConnection
  }

  
  // If already connecting, wait for that connection
  if (connectionPromise) {
    return connectionPromise
  }
  
  // Create new connection
  const config = getRconConfig()
  connectionPromise = Rcon.connect({
    host: config.host,
    port: config.port,
    password: config.password,
    timeout: RCON_CONFIG.connectionTimeout,
  })
  
  try {
    pooledConnection = await connectionPromise
    lastUsed = now
    
    // Set up auto-close on idle
    pooledConnection.on('end', () => {
      pooledConnection = null
      connectionPromise = null
    })
    
    logger.rcon.connected(config.host)
    return pooledConnection
  } catch (error) {
    connectionPromise = null
    throw error
  } finally {
    connectionPromise = null
  }
}

/**
 * Execute a single RCON command using pooled connection
 * Falls back to per-request connection if pool fails
 */
export async function executeRconCommand(command: string): Promise<string> {
  try {
    // Try pooled connection first
    const rcon = await getPooledConnection()
    const response = await rcon.send(command)
    lastUsed = Date.now()
    return response || ''
  } catch {
    // Fallback to per-request connection
    logger.debug('RCON pool failed, using per-request connection', 200)
    const config = getRconConfig()
    
    const rcon = await Rcon.connect({
      host: config.host,
      port: config.port,
      password: config.password,
      timeout: RCON_CONFIG.connectionTimeout,
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
  if (!isValidMinecraftName(playerName)) {
    logger.security.invalidInput('verifyPlayerExists', playerName)
    return false
  }
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
  if (!isValidMinecraftName(playerName)) {
    logger.security.invalidInput('giveItemsToPlayer', playerName)
    return { success: false, results: ['Invalid player name'] }
  }

  // ด่านคัดกรองคำสั่งอันตรายชั้นล่างสุด ดึงค่าโดยตรงจาก shop.config.ts
  const { getShopConfig } = require('./config')
  const configData = getShopConfig()
  const dangerousPatterns = configData.security.dangerousCommandPatterns.map((p: string) => new RegExp(p, 'i'))

  const results: string[] = []
  let success = true

  let rcon: Rcon | null = null
  let isFromPool = false
  try {
    try {
      // พยายามดึง Connection จาก Pool เพื่อลด Overhead ในการ Handshake/Auth
      rcon = await getPooledConnection()
      isFromPool = true
    } catch (poolError) {
      // Fallback: หาก Pool เชื่อมต่อไม่ได้ ให้สร้าง Connection ใหม่แบบดั้งเดิม
      logger.debug(`RCON pool connection failed, falling back to per-request connection: ${poolError}`, 200)
      const config = getRconConfig()
      rcon = await Rcon.connect({
        host: config.host,
        port: config.port,
        password: config.password,
        timeout: 30000,
      })
      isFromPool = false
    }

    for (const cmd of commands) {
      try {
        // ป้องกันและสกัดกั้นคำสั่งอันตรายก่อนส่งเข้าเซิร์ฟเวอร์
        if (dangerousPatterns.some((pattern: RegExp) => pattern.test(cmd))) {
          logger.security.suspiciousActivity(`Blocked dangerous command in RCON Client layer: ${cmd}`, playerName)
          results.push(`Error: Command '${cmd}' is blocked for security reasons.`)
          success = false
          continue
        }

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
    
    // อัปเดตเวลาการใช้งานล่าสุดของ Pool
    if (isFromPool) {
      lastUsed = Date.now()
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.rcon.failed(playerName, `Connection failed: ${errorMessage}`)
    return { success: false, results: [`Connection error: ${errorMessage}`] }
  } finally {
    // ปิดการเชื่อมต่อเฉพาะกรณีที่เป็น Connection เดี่ยว (ไม่ได้ดึงมาจาก Pool)
    if (rcon && !isFromPool) {
      try {
        await rcon.end()
      } catch {
        // Ignore disconnect errors
      }
    }
  }

  return { success, results }
}
