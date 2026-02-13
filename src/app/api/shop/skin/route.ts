import { NextResponse } from 'next/server'
import { getRedis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream'
import { promisify } from 'util'

const streamPipeline = promisify(pipeline)

// Cache TTL: 1 hour (3600 seconds) for Redis
// Local file TTL: 24 hours
const LOCAL_FILE_TTL_MS = 24 * 60 * 60 * 1000 
const SKIN_DIR = path.join(process.cwd(), 'public', 'uploads', 'skins')

// Ensure skin directory exists
if (!fs.existsSync(SKIN_DIR)) {
  fs.mkdirSync(SKIN_DIR, { recursive: true })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const redis = getRedis()
  const cacheKey = `skin:${name}`
  const localFilePath = path.join(SKIN_DIR, `${name}.png`)
  const publicUrl = `/uploads/skins/${name}.png?t=${Date.now()}` // Add timestamp to bust browser cache if updated

  try {
    // 0. Check local file first
    let hasLocalFile = false
    try {
      if (fs.existsSync(localFilePath)) {
        const stats = fs.statSync(localFilePath)
        const age = Date.now() - stats.mtimeMs
        if (age < LOCAL_FILE_TTL_MS) {
          hasLocalFile = true
          // Return immediately if we have a fresh local file
          // Verify it's not 0 bytes
          if (stats.size > 0) {
            return NextResponse.json({ skinUrl: publicUrl, isBedrock: name.startsWith('BR_'), source: 'local' })
          }
        }
      }
    } catch (e) {
      // Ignore file check errors
    }

    // 1. Try to get from Redis (if no local file or purely for metadata)
    const cachedSkin = await redis.get(cacheKey)
    if (cachedSkin && hasLocalFile) {
       // If we have both, trust local file
       return NextResponse.json({ ...JSON.parse(cachedSkin), skinUrl: publicUrl, source: 'local-cached' })
    }

    let skinUrl: string | null = null
    const isBedrock = name.startsWith('BR_')
    const cleanName = isBedrock ? name.substring(3) : name

    if (isBedrock) {
      // Bedrock: GeyserMC API
      try {
        const xuidRes = await fetch(`https://api.geysermc.org/v2/xbox/xuid/${cleanName}`)
        if (xuidRes.ok) {
          const xuidData = await xuidRes.json()
          if (xuidData.xuid) {
            const skinRes = await fetch(`https://api.geysermc.org/v2/skin/${xuidData.xuid}`)
            if (skinRes.ok) {
              const skinData = await skinRes.json()
              if (skinData.texture_id) {
                skinUrl = `https://textures.minecraft.net/texture/${skinData.texture_id}`
              }
            }
          }
        }
      } catch (e) {
        logger.error(`Error fetching Bedrock skin for ${name}: ${e}`)
      }
      
      // Fallback if API fails
      if (!skinUrl) {
         skinUrl = `https://mc-heads.net/skin/${cleanName}`
      }

    } else {
      // Java: direct from mc-heads or similar
      skinUrl = `https://mc-heads.net/skin/${cleanName}`
    }

    // Download and save locally
    if (skinUrl) {
      try {
        const response = await fetch(skinUrl)
        if (response.ok && response.body) {
           await streamPipeline(response.body as any, fs.createWriteStream(localFilePath))
           logger.info(`Downloaded skin for ${name} to local storage`, 200)
        }
      } catch (downloadError) {
        logger.error(`Failed to download skin for ${name}: ${downloadError}`)
        // If download fails but we have an old local file, use it
        if (fs.existsSync(localFilePath)) {
           return NextResponse.json({ skinUrl: publicUrl, isBedrock, source: 'local-fallback' })
        }
        // Otherwise return the remote URL directly as fallback
        return NextResponse.json({ skinUrl, isBedrock, source: 'remote-fallback' })
      }
    }

    // Final result pointing to local file
    const result = { skinUrl: publicUrl, isBedrock, source: 'newly-downloaded' }

    // 2. Save metadata to Redis (shorter TTL)
    await redis.setex(cacheKey, 3600, JSON.stringify(result))

    return NextResponse.json(result)

  } catch (error) {
    logger.error(`Error in skin API for ${name}: ${error}`)
    
    // Emergency Fallback: If everything fails but we have a file, use it
     if (fs.existsSync(localFilePath)) {
       return NextResponse.json({ skinUrl: publicUrl, isBedrock: name.startsWith('BR_'), source: 'emergency-local' })
     }
     
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
