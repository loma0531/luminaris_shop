import { describe, it, expect } from 'vitest'
import {
  validateFileMagicBytes,
  sanitizeProcessOptions,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES
} from './fileValidation'

describe('fileValidation', () => {
  describe('validateFileMagicBytes', () => {
    it('validates JPEG files', () => {
      // JPEG magic bytes: 0xFF, 0xD8, 0xFF
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01])
      const result = validateFileMagicBytes(jpegBuffer, 'image/jpeg')
      expect(result.valid).toBe(true)
      expect(result.detectedType).toBe('image/jpeg')
    })

    it('validates PNG files', () => {
      // PNG magic bytes: 0x89, 0x50, 0x4E, 0x47
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D])
      const result = validateFileMagicBytes(pngBuffer, 'image/png')
      expect(result.valid).toBe(true)
      expect(result.detectedType).toBe('image/png')
    })

    it('validates GIF files', () => {
      // GIF magic bytes: 0x47, 0x49, 0x46 (GIF)
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
      const result = validateFileMagicBytes(gifBuffer, 'image/gif')
      expect(result.valid).toBe(true)
      expect(result.detectedType).toBe('image/gif')
    })

    it('validates WebP files', () => {
      // WebP magic bytes: RIFF....WEBP
      const webpBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
      const result = validateFileMagicBytes(webpBuffer, 'image/webp')
      expect(result.valid).toBe(true)
      expect(result.detectedType).toBe('image/webp')
    })

    it('rejects files that are too small', () => {
      const smallBuffer = Buffer.from([0xFF, 0xD8])
      const result = validateFileMagicBytes(smallBuffer, 'image/jpeg')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('File too small to validate')
    })

    it('rejects unknown file types', () => {
      const unknownBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
      const result = validateFileMagicBytes(unknownBuffer, 'application/pdf')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Unknown or unsupported file type')
    })

    it('accepts image/jpg as alias for image/jpeg', () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01])
      const result = validateFileMagicBytes(jpegBuffer, 'image/jpg')
      expect(result.valid).toBe(true)
    })

    it('detects MIME type mismatch', () => {
      // PNG buffer but claimed as JPEG
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D])
      const result = validateFileMagicBytes(pngBuffer, 'image/jpeg')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('MIME type mismatch')
      expect(result.detectedType).toBe('image/png')
    })
  })

  describe('sanitizeProcessOptions', () => {
    it('returns empty object for non-object input', () => {
      expect(sanitizeProcessOptions(null)).toEqual({})
      expect(sanitizeProcessOptions(undefined)).toEqual({})
      expect(sanitizeProcessOptions('string')).toEqual({})
    })

    it('sanitizes crop percentage values', () => {
      const options = {
        crop: {
          xPercent: 150,
          yPercent: -10,
          widthPercent: 50,
          heightPercent: 101
        }
      }
      const result = sanitizeProcessOptions(options)
      expect(result.crop?.xPercent).toBe(100)
      expect(result.crop?.yPercent).toBe(0)
      expect(result.crop?.widthPercent).toBe(50)
      expect(result.crop?.heightPercent).toBe(100)
    })

    it('sanitizes crop pixel values', () => {
      const options = {
        crop: {
          x: -50,
          y: 100,
          width: 15000,
          height: 200.5
        }
      }
      const result = sanitizeProcessOptions(options)
      expect(result.crop?.x).toBe(0)
      expect(result.crop?.y).toBe(100)
      expect(result.crop?.width).toBe(10000) // max
      expect(result.crop?.height).toBe(200) // floored
    })

    it('validates flipH and flipV as booleans', () => {
      const options = { flipH: true, flipV: false }
      const result = sanitizeProcessOptions(options)
      expect(result.flipH).toBe(true)
      expect(result.flipV).toBe(false)
    })

    it('ignores non-boolean flip values', () => {
      const options = { flipH: 'true', flipV: 1 }
      const result = sanitizeProcessOptions(options)
      expect(result.flipH).toBeUndefined()
      expect(result.flipV).toBeUndefined()
    })

    it('validates rotation to valid angles', () => {
      expect(sanitizeProcessOptions({ rotation: 0 }).rotation).toBe(0)
      expect(sanitizeProcessOptions({ rotation: 90 }).rotation).toBe(90)
      expect(sanitizeProcessOptions({ rotation: 180 }).rotation).toBe(180)
      expect(sanitizeProcessOptions({ rotation: 270 }).rotation).toBe(270)
    })

    it('defaults invalid rotation to 0', () => {
      expect(sanitizeProcessOptions({ rotation: 45 }).rotation).toBe(0)
      expect(sanitizeProcessOptions({ rotation: 360 }).rotation).toBe(0)
      expect(sanitizeProcessOptions({ rotation: -90 }).rotation).toBe(0)
    })
  })

  describe('Constants', () => {
    it('MAX_FILE_SIZE is 10MB', () => {
      expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024)
    })

    it('ALLOWED_MIME_TYPES includes common image types', () => {
      expect(ALLOWED_MIME_TYPES).toContain('image/jpeg')
      expect(ALLOWED_MIME_TYPES).toContain('image/png')
      expect(ALLOWED_MIME_TYPES).toContain('image/webp')
      expect(ALLOWED_MIME_TYPES).toContain('image/gif')
    })
  })
})
