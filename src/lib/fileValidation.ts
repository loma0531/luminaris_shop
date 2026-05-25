/**
 * File Validation Utilities
 * ตรวจสอบไฟล์อัปโหลดด้วย Magic Bytes
 */

interface ValidationResult {
  valid: boolean
  detectedType?: string
  error?: string
}

/**
 * Validate file type using magic bytes
 * ป้องกันการอัปโหลดไฟล์อันตรายที่เปลี่ยนนามสกุล
 */
export function validateFileMagicBytes(buffer: Buffer, expectedMimeType: string): ValidationResult {
  if (buffer.length < 4) {
    return { valid: false, error: 'File too small', detectedType: 'unknown' }
  }

  const signatures: { bytes: number[]; type: string; mime: string[] }[] = [
    { bytes: [0x89, 0x50, 0x4E, 0x47], type: 'png', mime: ['image/png'] },
    { bytes: [0xFF, 0xD8, 0xFF], type: 'jpeg', mime: ['image/jpeg', 'image/jpg'] },
    { bytes: [0x47, 0x49, 0x46, 0x38], type: 'gif', mime: ['image/gif'] },
  ]

  let detectedType = 'unknown'
  let detectedMime: string[] = []

  // Check WebP (RIFF....WEBP)
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    detectedType = 'webp'
    detectedMime = ['image/webp']
  } else {
    for (const sig of signatures) {
      const matches = sig.bytes.every((byte, i) => buffer[i] === byte)
      if (matches) {
        detectedType = sig.type
        detectedMime = sig.mime
        break
      }
    }
  }

  if (detectedType === 'unknown') {
    return { valid: false, error: 'Unrecognized file format', detectedType: 'unknown' }
  }

  if (expectedMimeType && !detectedMime.includes(expectedMimeType)) {
    return { valid: false, error: `File type mismatch. Expected ${expectedMimeType}, got ${detectedType}`, detectedType }
  }

  return { valid: true, detectedType }
}

/**
 * Sanitize crop/process options from client
 * จำกัดค่าให้อยู่ในขอบเขตที่ปลอดภัย
 */
export function sanitizeProcessOptions(raw: Record<string, unknown>): {
  crop?: { x: number; y: number; width: number; height: number }
} {
  if (!raw || typeof raw !== 'object') return {}

  const crop = raw.crop as Record<string, unknown> | undefined
  if (crop && typeof crop === 'object') {
    const MAX_DIM = 10000
    return {
      crop: {
        x: Math.max(0, Math.min(Number(crop.x) || 0, MAX_DIM)),
        y: Math.max(0, Math.min(Number(crop.y) || 0, MAX_DIM)),
        width: Math.max(1, Math.min(Number(crop.width) || 1, MAX_DIM)),
        height: Math.max(1, Math.min(Number(crop.height) || 1, MAX_DIM)),
      }
    }
  }

  return {}
}
