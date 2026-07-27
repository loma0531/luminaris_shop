import crypto from 'crypto'

/**
 * Decodes a base32 string into a Buffer
 */
function base32Decode(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleaned = base32.replace(/=+$/, '').toUpperCase()
  const length = cleaned.length
  
  let bits = 0
  let value = 0
  let index = 0
  
  const buffer = Buffer.alloc(Math.floor((length * 5) / 8))
  
  for (let i = 0; i < length; i++) {
    const val = alphabet.indexOf(cleaned.charAt(i))
    if (val === -1) {
      throw new Error('Invalid base32 character')
    }
    value = (value << 5) | val
    bits += 5
    if (bits >= 8) {
      buffer[index++] = (value >>> (bits - 8)) & 255
      bits -= 8
    }
  }
  
  return buffer
}

/**
 * Generates a TOTP code for a given base32 secret and time counter
 */
export function generateTOTP(secretBase32: string, timeStep = 30, digits = 6, time = Date.now()): string {
  const secret = base32Decode(secretBase32)
  const counter = Math.floor(time / 1000 / timeStep)
  
  const buffer = Buffer.alloc(8)
  
  // Write counter as 64-bit integer
  let temp = counter
  for (let i = 7; i >= 0; i--) {
    buffer[i] = temp & 0xff
    temp = temp >> 8
  }
  
  const hmac = crypto.createHmac('sha1', secret).update(buffer).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  )
  
  const otp = code % Math.pow(10, digits)
  return otp.toString().padStart(digits, '0')
}

/**
 * Verifies a TOTP code
 * หมายเหตุ: ฟังก์ชันนี้ไม่มี Replay Protection — ใช้สำหรับ test หรือ internal ที่เรียกต่อเนื่อง
 * สำหรับ production ให้ใช้ verifyTOTPWithReplayProtection แทน
 */
export function verifyTOTP(token: string, secretBase32: string, window = 1): boolean {
  // Clear any spaces
  const cleanToken = token.replace(/\s+/g, '')
  if (cleanToken.length !== 6 || isNaN(Number(cleanToken))) {
    return false
  }

  const now = Date.now()
  const timeStep = 30

  // Allow a window (drift tolerance: -1 to +1 step, which is -30s to +30s)
  for (let i = -window; i <= window; i++) {
    const checkTime = now + (i * timeStep * 1000)
    const expected = generateTOTP(secretBase32, timeStep, 6, checkTime)
    if (cleanToken === expected) {
      return true
    }
  }

  return false
}

/**
 * Verify TOTP พร้อม Replay Protection ผ่าน Redis
 * บันทึก token ที่ใช้แล้วลง Redis (TTL 90 วินาที) เพื่อป้องกันการนำกลับมาใช้ซ้ำ
 * 
 * @param token - 6-digit TOTP code
 * @param secretBase32 - Base32 secret
 * @param sessionKey - Unique key สำหรับแยก session เช่น email หรือ userId
 * @returns { valid: boolean, error?: string }
 */
export async function verifyTOTPWithReplayProtection(
  token: string,
  secretBase32: string,
  sessionKey: string
): Promise<{ valid: boolean; error?: string }> {
  // Clear any spaces
  const cleanToken = token.replace(/\s+/g, '')
  if (cleanToken.length !== 6 || isNaN(Number(cleanToken))) {
    return { valid: false, error: 'รูปแบบรหัส TOTP ไม่ถูกต้อง' }
  }

  // ตรวจสอบ TOTP window ก่อน
  if (!verifyTOTP(cleanToken, secretBase32)) {
    return { valid: false, error: 'รหัส TOTP ไม่ถูกต้องหรือหมดอายุ' }
  }

  // Replay Protection ด้วย Redis
  // TTL = 90 วินาที (3x time step) ครอบคลุม window ±1 ของโค้ดนี้
  const REPLAY_TTL_SECONDS = 90
  const replayKey = `totp:used:${sessionKey}:${cleanToken}`

  try {
    const { getCache } = await import('@/lib/cache/index')
    const cache = getCache()

    // ตรวจสอบว่า token นี้เคยถูกใช้ไปแล้วหรือยัง
    const alreadyUsed = await cache.get<string>(replayKey)
    if (alreadyUsed) {
      return { valid: false, error: 'รหัส TOTP นี้ถูกใช้งานไปแล้ว กรุณารอ token ใหม่' }
    }

    // Mark token ว่าถูกใช้แล้ว (atomic SET)
    await cache.set(replayKey, '1', REPLAY_TTL_SECONDS)

    return { valid: true }
  } catch (error) {
    // Fail-open: ถ้า Redis ไม่พร้อม ยังอนุญาตแต่ log ไว้
    // ในระบบ production ควรเปลี่ยนเป็น fail-secure ถ้าต้องการ strict
    console.warn(`[TOTP] Replay protection cache error (fail-open): ${error}`)
    return { valid: true }
  }
}

/**
 * Helper to generate a random Base32 secret for setup
 */
export function generateTOTPSecret(length = 16): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const randomBytes = crypto.randomBytes(length)
  let secret = ''
  for (let i = 0; i < length; i++) {
    secret += alphabet[randomBytes[i] % alphabet.length]
  }
  return secret
}

/**
 * Helper to generate Google Authenticator OTPAuth URL
 */
export function getOTPAuthURL(email: string, issuer: string, secret: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`
}
