/**
 * File Validation Utilities
 * ตรวจสอบความถูกต้องของไฟล์ที่อัพโหลด ทั้ง Magic Bytes และ MIME Type
 */

// Magic bytes (file signatures) for image validation
const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/gif': [0x47, 0x49, 0x46],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF header
}

export interface FileValidationResult {
  valid: boolean
  error?: string
  detectedType?: string
}

/**
 * Validate file by checking magic bytes (file signature)
 * This is more secure than just checking MIME type which can be spoofed
 */
export function validateFileMagicBytes(buffer: Buffer, claimedType: string): FileValidationResult {
  if (buffer.length < 12) {
    return { valid: false, error: 'File too small to validate' }
  }

  // Check against all known magic bytes
  for (const [type, magic] of Object.entries(MAGIC_BYTES)) {
    const headerMatches = magic.every((byte, index) => buffer[index] === byte)
    if (headerMatches) {
      // For WebP, also check for WEBP string at offset 8-12
      if (type === 'image/webp') {
        const webpSignature = buffer.slice(8, 12).toString('ascii')
        if (webpSignature !== 'WEBP') {
          continue
        }
      }
      
      // Check if claimed type matches detected type (with some flexibility)
      if (claimedType !== type && !isCompatibleType(claimedType, type)) {
        return { 
          valid: false, 
          error: `MIME type mismatch: claimed ${claimedType}, actual ${type}`,
          detectedType: type
        }
      }
      
      return { valid: true, detectedType: type }
    }
  }

  return { valid: false, error: 'Unknown or unsupported file type' }
}

/**
 * Check if two MIME types are compatible (e.g., image/jpg -> image/jpeg)
 */
function isCompatibleType(claimed: string, detected: string): boolean {
  const allowedMappings: Record<string, string[]> = {
    'image/jpg': ['image/jpeg'],
  }
  return allowedMappings[claimed]?.includes(detected) ?? false
}

/**
 * Sanitize and validate processing options to prevent injection attacks
 * Ensures all numeric values are within safe bounds
 */
export function sanitizeProcessOptions(options: unknown): {
  crop?: { 
    x?: number
    y?: number
    width?: number
    height?: number
    xPercent?: number
    yPercent?: number
    widthPercent?: number
    heightPercent?: number
  }
  flipH?: boolean
  flipV?: boolean
  rotation?: number
} {
  if (!options || typeof options !== 'object') {
    return {}
  }

  const sanitized: ReturnType<typeof sanitizeProcessOptions> = {}
  const opts = options as Record<string, unknown>

  // Validate crop - ensure all values are safe numbers
  if (opts.crop && typeof opts.crop === 'object') {
    const crop = opts.crop as Record<string, unknown>
    const sanitizedCrop: Record<string, number> = {}
    
    // Percentage-based values (0-100)
    for (const key of ['xPercent', 'yPercent', 'widthPercent', 'heightPercent']) {
      if (typeof crop[key] === 'number' && isFinite(crop[key] as number)) {
        sanitizedCrop[key] = Math.max(0, Math.min(100, crop[key] as number))
      }
    }
    
    // Pixel-based values (0-10000 max for safety)
    for (const key of ['x', 'y', 'width', 'height']) {
      if (typeof crop[key] === 'number' && isFinite(crop[key] as number)) {
        sanitizedCrop[key] = Math.max(0, Math.min(10000, Math.floor(crop[key] as number)))
      }
    }
    
    if (Object.keys(sanitizedCrop).length > 0) {
      sanitized.crop = sanitizedCrop as typeof sanitized.crop
    }
  }

  // Validate flips - must be boolean
  if (typeof opts.flipH === 'boolean') sanitized.flipH = opts.flipH
  if (typeof opts.flipV === 'boolean') sanitized.flipV = opts.flipV

  // Validate rotation - must be 0, 90, 180, or 270
  if (typeof opts.rotation === 'number') {
    const validRotations = [0, 90, 180, 270]
    sanitized.rotation = validRotations.includes(opts.rotation) ? opts.rotation : 0
  }

  return sanitized
}

// Constants for file validation
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
