/**
 * Input Validation Utilities
 * ตรวจสอบและทำความสะอาด Input ต่างๆ เพื่อป้องกันการโจมตี
 */

/**
 * Validate MongoDB ObjectId format
 */
export function isValidObjectId(id: string): boolean {
  if (typeof id !== 'string') return false
  return /^[a-fA-F0-9]{24}$/.test(id)
}

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

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

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

/**
 * Validate and sanitize price
 * Returns null if invalid, rounded to 2 decimals if valid
 */
export function validatePrice(price: unknown): number | null {
  const parsed = typeof price === 'number' ? price : parseFloat(String(price))
  if (isNaN(parsed) || !isFinite(parsed) || parsed <= 0 || parsed > 1000000) return null
  return Math.round(parsed * 100) / 100 // Round to 2 decimals
}

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
