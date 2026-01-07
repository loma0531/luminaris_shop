import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import sharp from 'sharp'
import crypto from 'crypto'
import { requireAdminAuth } from '@/lib/adminAuth'
import { validateFileMagicBytes, sanitizeProcessOptions } from '@/lib/fileValidation'
import { logger, createTimer } from '@/lib/logger'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'products')
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const OUTPUT_WIDTH = 800
const OUTPUT_HEIGHT = 450

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp']

export async function POST(request: NextRequest) {
  const timer = createTimer()
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
  } catch (error) {
    logger.system.error(`Directory creation error: ${error}`)
    // Continue only if error is EEXIST? No, simpler to just log and try writing.
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 })
    }

    // Check file extension
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
      logger.upload.rejected('Unsupported file extension', extension)
      return NextResponse.json({ 
        success: false, 
        error: `Unsupported file extension .${extension}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` 
      }, { status: 400 })
    }

    // Check file size BEFORE reading
    if (file.size > MAX_FILE_SIZE) {
      logger.upload.rejected('File too large', `${Math.round(file.size/1024)}KB`)
      return NextResponse.json({ success: false, error: 'File size must be under 5MB' }, { status: 400 })
    }

    logger.upload.started(file.name, file.size)

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Validate magic bytes (actual file content)
    const validation = validateFileMagicBytes(buffer, file.type || 'image/jpeg')
    if (!validation.valid) {
      logger.upload.rejected('Invalid magic bytes', validation.detectedType || 'unknown')
      return NextResponse.json({ 
        success: false, 
        error: validation.error || 'Invalid image file' 
      }, { status: 400 })
    }

    // Get and sanitize crop parameters (limit size to prevent DoS)
    const rawCrop = formData.get('crop') as string | null
    let processOptions: ReturnType<typeof sanitizeProcessOptions> = {}
    if (rawCrop) {
      if (rawCrop.length > 1000) {
        logger.security.suspiciousActivity('Oversized crop JSON', rawCrop.length.toString())
        return NextResponse.json({ success: false, error: 'Invalid crop data' }, { status: 400 })
      }
      try {
        processOptions = sanitizeProcessOptions(JSON.parse(rawCrop))
      } catch {
        return NextResponse.json({ success: false, error: 'Invalid crop format' }, { status: 400 })
      }
    }

    // Get and validate rotation
    let rotation = Number(formData.get('rotation') || 0)
    rotation = Math.round(rotation / 90) * 90 % 360
    if (rotation < 0) rotation += 360

    logger.upload.processing(file.name)

    // Process image with sharp
    let sharpInstance = sharp(buffer)
    const metadata = await sharpInstance.metadata()

    // Apply rotation
    if (rotation > 0 && rotation !== 360) {
      sharpInstance = sharpInstance.rotate(rotation)
    }

    // Apply crop
    if (processOptions.crop && metadata.width && metadata.height) {
      const crop = processOptions.crop
      const extractOptions = {
        left: Math.max(0, Math.round(crop.x || 0)),
        top: Math.max(0, Math.round(crop.y || 0)),
        width: Math.min(Math.round(crop.width || metadata.width), metadata.width - Math.round(crop.x || 0)),
        height: Math.min(Math.round(crop.height || metadata.height), metadata.height - Math.round(crop.y || 0)),
      }

      if (extractOptions.width > 0 && extractOptions.height > 0) {
        sharpInstance = sharpInstance.extract(extractOptions)
      }
    }

    // Resize and optimize
    const processedBuffer = await sharpInstance
      .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality: 85 })
      .toBuffer()

    // Generate safe filename
    const filename = `${crypto.randomUUID()}.webp`

    // Save file
    const filePath = path.join(UPLOAD_DIR, filename)
    await fs.writeFile(filePath, processedBuffer)

    const imageUrl = `/uploads/products/${filename}`
    
    logger.upload.success(filename, processedBuffer.length, timer())
    logger.debug(`[Upload] Saved file to: ${filePath}`)
    logger.debug(`[Upload] Public URL: ${imageUrl}`)

    return NextResponse.json({
      success: true,
      imageUrl,
      filename,
      originalSize: file.size,
      processedSize: processedBuffer.length,
    })
  } catch {
    logger.system.error('Failed to upload image')
    return NextResponse.json({ success: false, error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}
