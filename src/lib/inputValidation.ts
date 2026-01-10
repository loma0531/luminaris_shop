/**
 * Input Validation Utilities
 * ตรวจสอบและทำความสะอาด Input ต่างๆ เพื่อป้องกันการโจมตี
 */

// ========== MongoDB ObjectId ==========

/**
 * Validate MongoDB ObjectId format
 */
export function isValidObjectId(id: string): boolean {
  if (typeof id !== 'string') return false
  return /^[a-fA-F0-9]{24}$/.test(id)
}

// ========== Minecraft Name ==========

/**
 * Validate Minecraft username
 * Standard: 3-16 chars, alphanumeric and underscore
 * Bedrock: may have BR_ prefix
 */
export function isValidMinecraftName(name: string): boolean {
  if (typeof name !== 'string') return false
  const standardRegex = /^[a-zA-Z0-9_]{3,16}$/
  const bedrockRegex = /^BR_[a-zA-Z0-9_]{3,16}$/
  return standardRegex.test(name) || bedrockRegex.test(name)
}

// ========== Email ==========

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ========== String Sanitization ==========

/**
 * Sanitize string input - remove potential XSS vectors
 */
export function sanitizeString(input: string, maxLength = 500): string {
  if (typeof input !== 'string') return ''
  
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Remove HTML brackets
    .replace(/javascript:/gi, '') // Remove JS protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .replace(/data:/gi, '') // Remove data URIs
}

// ========== Price Validation ==========

/**
 * Validate and sanitize price
 * Returns null if invalid, integer if valid (no decimal points for Thai Baht)
 */
export function validatePrice(price: unknown): number | null {
  const parsed = typeof price === 'number' ? price : parseFloat(String(price))
  if (isNaN(parsed) || !isFinite(parsed) || parsed <= 0 || parsed > 1000000) return null
  return Math.round(parsed) // Round to integer (Thai Baht doesn't use decimals typically)
}

// ========== Pagination ==========

/**
 * Validate pagination parameters
 * Returns safe defaults if invalid
 */
export function validatePagination(
  page: unknown, 
  limit: unknown,
  maxLimit = 100
): { page: number; limit: number; skip: number } {
  const parsedPage = Math.max(1, parseInt(String(page)) || 1)
  const parsedLimit = Math.min(maxLimit, Math.max(1, parseInt(String(limit)) || 10))
  const skip = (parsedPage - 1) * parsedLimit
  return { page: parsedPage, limit: parsedLimit, skip }
}

// ========== Status Validation ==========

/**
 * Validate order status
 */
export function isValidOrderStatus(status: unknown): status is 'PENDING' | 'AWAITING_PAYMENT' | 'COMPLETED' | 'CANCELLED' {
  return ['PENDING', 'AWAITING_PAYMENT', 'COMPLETED', 'CANCELLED'].includes(String(status))
}

/**
 * Validate payment status
 */
export function isValidPaymentStatus(status: unknown): status is 'PENDING' | 'VERIFIED' | 'REJECTED' {
  return ['PENDING', 'VERIFIED', 'REJECTED'].includes(String(status))
}

// ========== Command Sanitization ==========

/**
 * Sanitize array of commands for RCON
 * Remove any commands that might be dangerous
 */
export function sanitizeCommands(commands: unknown[]): string[] {
  if (!Array.isArray(commands)) return []
  
  return commands
    .filter((cmd): cmd is string => typeof cmd === 'string')
    .map(cmd => cmd.trim())
    .filter(cmd => cmd.length > 0 && cmd.length < 500)
}

// ========== Custom Input Validation ==========

// Pattern อันตรายที่ต้องบล็อก
const DANGEROUS_PATTERNS = [
  /;/,           // Command separator
  /\n/,          // Newline
  /\r/,          // Carriage return
  /\//,          // Command prefix
  /\\/,          // Backslash
  /\$/,          // Variable injection
  /`/,           // Backtick
  /\|/,          // Pipe
  />/,           // Redirect
  /</,           // Redirect
  /{/,           // Bracket (except in placeholder)
  /}/,           // Bracket (except in placeholder)
  /'/,           // Single quote
  /"/,           // Double quote
]

// ความยาวสูงสุดของ customInput
const MAX_CUSTOM_INPUT_LENGTH = 2000

/**
 * ตรวจสอบ customInput ให้ปลอดภัย
 */
export function validateCustomInput(input: string): { valid: boolean; error?: string; sanitized?: string } {
  // ตรวจสอบว่ามีค่าหรือไม่
  if (!input || typeof input !== 'string') {
    return { valid: false, error: 'กรุณากรอกข้อมูล' }
  }

  const trimmed = input.trim()

  // ตรวจสอบความยาว
  if (trimmed.length === 0) {
    return { valid: false, error: 'กรุณากรอกข้อมูล' }
  }

  if (trimmed.length > MAX_CUSTOM_INPUT_LENGTH) {
    return { valid: false, error: `ข้อมูลยาวเกินไป (สูงสุด ${MAX_CUSTOM_INPUT_LENGTH} ตัวอักษร)` }
  }

  // ตรวจสอบ patterns อันตราย
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: 'มีตัวอักษรที่ไม่อนุญาต' }
    }
  }

  // Note: ไม่บังคับให้มี & หรือ # แล้ว เพราะ customInput อาจไม่ใช่โค้ดสี

  return { valid: true, sanitized: trimmed }
}

/**
 * Sanitize customInput ให้ปลอดภัย
 * ใช้เมื่อต้องการทำความสะอาด input ก่อนใช้งาน
 */
export function sanitizeCustomInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return ''
  }

  // ลบ whitespace ต้นและท้าย
  let sanitized = input.trim()

  // ลบตัวอักษรอันตราย
  sanitized = sanitized
    .replace(/[;\n\r\/\\$`|><{}'\"]/g, '')
    .substring(0, MAX_CUSTOM_INPUT_LENGTH)

  return sanitized
}

/**
 * แทนที่ {customInput} ใน command ด้วยค่าจริง
 */
export function replaceCustomInput(command: string, customInput: string): string {
  if (!command || typeof command !== 'string') {
    return command
  }

  // Sanitize input ก่อนแทนที่
  const sanitized = sanitizeCustomInput(customInput)
  
  // แทนที่ {customInput} ด้วยค่าจริง
  return command.replace(/\{customInput\}/gi, sanitized)
}

/**
 * ตรวจสอบว่า command มี {customInput} placeholder หรือไม่
 */
export function commandRequiresCustomInput(commands: string[]): boolean {
  if (!Array.isArray(commands)) {
    return false
  }
  
  return commands.some(cmd => /\{customInput\}/i.test(cmd))
}
