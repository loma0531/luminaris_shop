import mysql, { Pool } from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { logger } from '@/lib/logger'

interface MySQLConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

const getMySQLConfig = (): MySQLConfig => ({
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'minecraft',
})

// Connection pool singleton
let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const config = getMySQLConfig()
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    })
  }
  return pool
}

/**
 * Verify if a player exists in CMI_users table
 */
export async function verifyPlayerInDatabase(username: string): Promise<{ exists: boolean; playerData?: { id: number; username: string } }> {
  try {
    const connection = await getPool().getConnection()
    try {
      // Query CMI_users table for the username (case-insensitive)
      const [rows] = await connection.execute(
        'SELECT id, username FROM CMI_users WHERE LOWER(username) = LOWER(?)',
        [username]
      )
      
      const results = rows as { id: number; username: string }[]
      
      if (results.length > 0) {
        return {
          exists: true,
          playerData: results[0],
        }
      }
      
      return { exists: false }
    } finally {
      connection.release()
    }
  } catch (error) {
    logger.system.error('MySQL error during player verification')
    throw error
  }
}

/**
 * Verify player password against AuthMe database table
 */
export async function verifyAuthMePassword(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const connection = await getPool().getConnection()
    try {
      // Query AuthMe table for the hashed password (case-insensitive username check)
      const [rows] = await connection.execute(
        'SELECT password FROM authme WHERE LOWER(username) = LOWER(?)',
        [username]
      )
      
      const results = rows as { password: string }[]
      
      if (results.length === 0) {
        return { success: false, error: 'ไม่พบผู้เล่นในระบบเซิร์ฟเวอร์ กรุณาสมัครสมาชิกในเกมก่อน' }
      }
      
      const hashedPassword = results[0].password
      
      // Compare passwords using bcryptjs (handles PHP $2y$ format automatically)
      const isMatch = await bcrypt.compare(password, hashedPassword)
      if (!isMatch) {
        return { success: false, error: 'รหัสผ่านเซิร์ฟเวอร์ไม่ถูกต้อง' }
      }
      
      return { success: true }
    } finally {
      connection.release()
    }
  } catch (error) {
    logger.system.error(`AuthMe password verification failed: ${error}`)
    return { success: false, error: 'เกิดข้อผิดพลาดในการตรวจสอบรหัสผ่านจากระบบเซิร์ฟเวอร์' }
  }
}

/**
 * Test MySQL connection
 */
export async function testMySQLConnection(): Promise<boolean> {
  try {
    const connection = await getPool().getConnection()
    try {
      await connection.ping()
      return true
    } finally {
      connection.release()
    }
  } catch {
    logger.system.error('MySQL connection test failed')
    return false
  }
}

export interface PlayerProfile {
  displayName: string | null
  balance: number
  playerUuid: string | null
  jobs: string[]
  lastLoginTime: number | null
  lastLogoffTime: number | null
  totalPlayTime: number | null
}

/**
 * Get player profile data from CMI_users and jobs tables
 */
export async function getPlayerProfile(username: string): Promise<PlayerProfile | null> {
  try {
    const connection = await getPool().getConnection()
    try {
      // Query CMI_users for DisplayName, Balance, player_uuid, login times, play time
      const [userRows] = await connection.execute(
        `SELECT DisplayName, Balance, player_uuid, LastLoginTime, LastlogoffTime, TotalPlayTime 
         FROM CMI_users WHERE LOWER(username) = LOWER(?)`,
        [username]
      )
      
      const userResults = userRows as { 
        DisplayName: string | null
        Balance: number
        player_uuid: string | null
        LastLoginTime: number | null
        LastlogoffTime: number | null
        TotalPlayTime: number | null
      }[]
      
      if (userResults.length === 0) {
        return null
      }
      
      const userData = userResults[0]
      
      // Query jobs - join jobs_users and jobs_jobs
      const [jobRows] = await connection.execute(
        `SELECT j.job 
         FROM jobs_users u 
         JOIN jobs_jobs j ON u.id = j.id 
         WHERE LOWER(u.username) = LOWER(?)`,
        [username]
      )
      
      const jobResults = jobRows as { job: string }[]
      const jobs = jobResults.map(row => row.job)
      
      return {
        displayName: userData.DisplayName,
        balance: userData.Balance || 0,
        playerUuid: userData.player_uuid,
        jobs,
        lastLoginTime: userData.LastLoginTime,
        lastLogoffTime: userData.LastlogoffTime,
        totalPlayTime: userData.TotalPlayTime,
      }
    } finally {
      connection.release()
    }
  } catch (error) {
    logger.system.error('MySQL error fetching profile')
    throw error
  }
}
