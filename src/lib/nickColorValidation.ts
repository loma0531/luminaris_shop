/**
 * Nick Color Validation Library
 * ตรวจสอบและ sanitize โค้ดสีสำหรับ CMI nick command
 */

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

// ความยาวสูงสุดของโค้ดสี (รวม color codes และชื่อ)
const MAX_LENGTH = 200

/**
 * ตรวจสอบ format โค้ดสี CMI
 */
export function validateNickColorCode(code: string): { valid: boolean; error?: string; sanitized?: string } {
  // ตรวจสอบว่ามีค่าหรือไม่
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'กรุณากรอกโค้ดสี' }
  }

  const trimmed = code.trim()

  // ตรวจสอบความยาว
  if (trimmed.length === 0) {
    return { valid: false, error: 'กรุณากรอกโค้ดสี' }
  }

  if (trimmed.length > MAX_LENGTH) {
    return { valid: false, error: `โค้ดสียาวเกินไป (สูงสุด ${MAX_LENGTH} ตัวอักษร)` }
  }

  // ตรวจสอบ patterns อันตราย
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: 'โค้ดสีมีตัวอักษรที่ไม่อนุญาต' }
    }
  }

  // ตรวจสอบว่ามี & หรือ # เพื่อบ่งบอกว่าเป็น color code
  if (!trimmed.includes('&') && !trimmed.includes('#')) {
    return { valid: false, error: 'โค้ดสีต้องมี & หรือ # สำหรับระบุสี' }
  }

  return { valid: true, sanitized: trimmed }
}

/**
 * Sanitize โค้ดสีให้ปลอดภัย
 * ใช้เมื่อต้องการทำความสะอาด input ก่อนใช้งาน
 */
export function sanitizeNickColorCode(code: string): string {
  if (!code || typeof code !== 'string') {
    return ''
  }

  // ลบ whitespace ต้นและท้าย
  let sanitized = code.trim()

  // ลบตัวอักษรอันตราย
  sanitized = sanitized
    .replace(/[;\n\r\/\\$`|><{}'"]/g, '')
    .substring(0, MAX_LENGTH)

  return sanitized
}

/**
 * แทนที่ {customInput} ใน command ด้วยค่าจริง
 */
export function replaceCustomInputInCommand(command: string, customInput: string): string {
  if (!command || typeof command !== 'string') {
    return command
  }

  // Sanitize input ก่อนแทนที่
  const sanitized = sanitizeNickColorCode(customInput)
  
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
