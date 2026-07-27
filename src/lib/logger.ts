/**
 * Comprehensive Logging System
 * Format: [DD/MM/YYYY HH:MM:SS] [STATUS_CODE] [LEVEL] English message
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  SECURITY = 'SECURITY',
}

// Environment check
const isServer = typeof window === 'undefined'

// Color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  
  // Level colors
  DEBUG: '\x1b[36m',    // Cyan
  INFO: '\x1b[32m',     // Green
  WARN: '\x1b[33m',     // Yellow
  ERROR: '\x1b[31m',    // Red
  SECURITY: '\x1b[35m', // Magenta
  
  // Status code colors
  success: '\x1b[32m',  // Green (2xx)
  redirect: '\x1b[33m', // Yellow (3xx)
  clientError: '\x1b[31m', // Red (4xx)
  serverError: '\x1b[31m', // Red (5xx)
}

function formatTimestamp(): string {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

function getStatusColor(status: number): string {
  if (!isServer) return ''
  if (status >= 200 && status < 300) return COLORS.success
  if (status >= 300 && status < 400) return COLORS.redirect
  if (status >= 400 && status < 500) return COLORS.clientError
  return COLORS.serverError
}

function formatLevel(level: LogLevel): string {
  if (!isServer) return `[${level}]`
  const color = COLORS[level]
  return `${color}[${level}]${COLORS.reset}`
}

/**
 * Mask sensitive data like passwords or tokens in logs
 */
function maskSensitiveData(message: string): string {
  if (!message) return message
  // Mask anything looking like a password parameter
  // e.g. "register mypassword" -> "register *****"
  // "login password123" -> "login *****"
  return message
    .replace(/(register|login|changepassword|auth|password)\s+([^\s]+)/gi, '$1 *****')
    .replace(/(token=|bearer\s+)([a-zA-Z0-9\.\-\_]+)/gi, '$1*****')
}


function log(level: LogLevel, message: string, statusCode?: number, duration?: number): void {
  const timestamp = `[${formatTimestamp()}]`
  
  let statusStr = ''
  if (statusCode) {
    if (isServer) {
        const statusColor = getStatusColor(statusCode)
        statusStr = ` ${statusColor}[${statusCode}]${COLORS.reset}`
    } else {
        statusStr = ` [${statusCode}]`
    }
  }
  
  const levelStr = formatLevel(level)
  const durationStr = duration !== undefined ? ` [Duration: ${duration}ms]` : ''
  
  const logLine = `${timestamp}${statusStr} ${levelStr}${durationStr} ${message}`
  
  switch (level) {
    case LogLevel.ERROR:
    case LogLevel.SECURITY:
      console.error(logLine)
      break
    case LogLevel.WARN:
      console.warn(logLine)
      break
    default:
      console.log(logLine)
  }
}

// =========================================
// Main Logger - English messages
// =========================================
export const logger = {
  // Generic logging
  debug: (message: string, statusCode?: number, duration?: number) => log(LogLevel.DEBUG, message, statusCode, duration),
  info: (message: string, statusCode?: number, duration?: number) => log(LogLevel.INFO, message, statusCode, duration),
  warn: (message: string, statusCode?: number, duration?: number) => log(LogLevel.WARN, message, statusCode, duration),
  error: (message: string, statusCode?: number, duration?: number) => log(LogLevel.ERROR, message, statusCode, duration),
  
  // =========================================
  // API Request/Response
  // =========================================
  api: {
    request: (method: string, path: string) => {
      log(LogLevel.INFO, `${method} ${path}`, 200)
    },
  },
  
  // =========================================
  // Authentication
  // =========================================
  auth: {
    adminLoginAttempt: (email: string) => {
      log(LogLevel.INFO, `Admin login attempt: ${email}`, 200)
    },
    
    adminLoginSuccess: (email: string, duration?: number) => {
      log(LogLevel.INFO, `Admin login success: ${email}`, 200, duration)
    },
    
    adminLoginFailed: (email: string, reason: string) => {
      log(LogLevel.SECURITY, `Admin login failed: ${email} - ${reason}`, 401)
    },
    
    adminLogout: () => {
      log(LogLevel.INFO, `Admin logout`, 200)
    },
    
    tokenVerified: (duration?: number) => {
      log(LogLevel.DEBUG, `Token verified`, 200, duration)
    },
    
    tokenInvalid: (reason: string) => {
      log(LogLevel.SECURITY, `Invalid token: ${reason}`, 401)
    },
    
    userLogin: (minecraftName: string, duration?: number) => {
      log(LogLevel.INFO, `User login: ${minecraftName}`, 200, duration)
    },
    
    userCreated: (minecraftName: string, duration?: number) => {
      log(LogLevel.INFO, `New user registered: ${minecraftName}`, 201, duration)
    },
    
    userLogout: (minecraftName: string) => {
      log(LogLevel.INFO, `User logout: ${minecraftName}`, 200)
    },
  },
  
  // =========================================
  // Order
  // =========================================
  order: {
    created: (orderId: number, minecraftName: string, total: number, itemCount: number, duration?: number) => {
      log(LogLevel.INFO, `Order #${orderId} created by ${minecraftName}: ${itemCount} items, ${total} THB`, 201, duration)
    },
    
    itemDetail: (productName: string, quantity: number, price: number) => {
      log(LogLevel.DEBUG, `   - ${productName} x${quantity} = ${price * quantity} THB`, 200)
    },
    
    viewed: (orderId: number, minecraftName: string, duration?: number) => {
      log(LogLevel.DEBUG, `Order #${orderId} viewed by ${minecraftName}`, 200, duration)
    },
    
    statusChanged: (orderId: number, oldStatus: string, newStatus: string, minecraftName: string) => {
      log(LogLevel.INFO, `Order #${orderId} (${minecraftName}): ${oldStatus} -> ${newStatus}`, 200)
    },
    
    completed: (orderId: number, minecraftName: string, total: number, duration?: number) => {
      log(LogLevel.INFO, `Order #${orderId} completed for ${minecraftName} (${total} THB)`, 200, duration)
    },
    
    cancelled: (orderId: number, minecraftName: string, reason?: string, duration?: number) => {
      log(LogLevel.WARN, `Order #${orderId} cancelled for ${minecraftName}${reason ? `: ${reason}` : ''}`, 200, duration)
    },
    
    deleted: (orderId: string) => {
      log(LogLevel.WARN, `Order #${orderId} deleted by admin`, 200)
    },
    
    listViewed: (count: number, by: string, duration?: number) => {
      log(LogLevel.DEBUG, `${by} viewed orders list: ${count} orders`, 200, duration)
    },
  },
  
  // =========================================
  // Payment
  // =========================================
  payment: {
    created: (paymentId: number, minecraftName: string, amount: number) => {
      log(LogLevel.INFO, `Payment #${paymentId} created for ${minecraftName}: ${amount} THB`, 201)
    },
    
    slipUploaded: (paymentId: number, minecraftName: string) => {
      log(LogLevel.INFO, `Slip uploaded for payment #${paymentId} by ${minecraftName}`, 200)
    },
    
    slipVerifying: (paymentId: number) => {
      log(LogLevel.INFO, `Verifying slip for payment #${paymentId}...`, 200)
    },
    
    slipVerified: (paymentId: number, minecraftName: string, amount: number, duration?: number) => {
      log(LogLevel.INFO, `Payment #${paymentId} verified: ${amount} THB`, 200, duration)
    },
    
    slipRejected: (paymentId: number, reason: string) => {
      log(LogLevel.WARN, `Payment #${paymentId} rejected: ${reason}`, 400)
    },
    
    amountMismatch: (paymentId: number, expected: number, actual: number) => {
      log(LogLevel.WARN, `Payment #${paymentId} amount mismatch: expected ${expected}, got ${actual}`, 400)
    },
    
    statusChanged: (paymentId: number, oldStatus: string, newStatus: string, duration?: number) => {
      log(LogLevel.INFO, `Payment #${paymentId}: ${oldStatus} -> ${newStatus}`, 200, duration)
    },
    
    listViewed: (count: number, duration?: number) => {
      log(LogLevel.DEBUG, `Admin viewed payments list: ${count} payments`, 200, duration)
    },
    
    notFound: (paymentId: number) => {
      log(LogLevel.WARN, `Payment #${paymentId} not found`, 404)
    },
    
    alreadyProcessed: (paymentId: number) => {
      log(LogLevel.WARN, `Payment #${paymentId} already processed`, 400)
    },
  },
  
  // =========================================
  // Product
  // =========================================
  product: {
    created: (productId: string, name: string, price: number, duration?: number) => {
      log(LogLevel.INFO, `Product created: "${name}" - ${price} THB`, 201, duration)
    },
    
    updated: (productId: string, name: string, changes: string, duration?: number) => {
      log(LogLevel.INFO, `Product updated: "${name}" (${changes})`, 200, duration)
    },
    
    deleted: (productId: string, name: string, duration?: number) => {
      log(LogLevel.WARN, `Product deleted: "${name}"`, 200, duration)
    },
    
    toggled: (productId: string, name: string, isActive: boolean) => {
      const status = isActive ? 'activated' : 'deactivated'
      log(LogLevel.INFO, `Product ${status}: "${name}"`, 200)
    },
    
    viewed: (productId: string, name: string, duration?: number) => {
      log(LogLevel.DEBUG, `Product viewed: "${name}"`, 200, duration)
    },
    
    listViewed: (count: number, duration?: number) => {
      log(LogLevel.DEBUG, `Products list viewed: ${count} products`, 200, duration)
    },
    
    imageUploaded: (productId: string, filename: string) => {
      log(LogLevel.INFO, `Product image uploaded: ${filename}`, 200)
    },
    
    imageDeleted: (filename: string) => {
      log(LogLevel.DEBUG, `Old image deleted: ${filename}`, 200)
    },
    
    duplicateNameAttempt: (name: string) => {
      log(LogLevel.WARN, `Duplicate product name: "${name}"`, 400)
    },
    
    imageDeleteFailed: (imageUrl: string) => {
      log(LogLevel.WARN, `Failed to delete image: ${imageUrl}`, 500)
    },
  },
  
  // =========================================
  // Category
  // =========================================
  category: {
    created: (categoryId: string, name: string, duration?: number) => {
      log(LogLevel.INFO, `Category created: "${name}"`, 201, duration)
    },
    
    updated: (categoryId: string, name: string, duration?: number) => {
      log(LogLevel.INFO, `Category updated: "${name}"`, 200, duration)
    },
    
    deleted: (categoryId: string, name: string, duration?: number) => {
      log(LogLevel.WARN, `Category deleted: "${name}"`, 200, duration)
    },
    
    deleteBlocked: (categoryId: string, name: string, productCount: number) => {
      log(LogLevel.WARN, `Cannot delete category "${name}": has ${productCount} products`, 400)
    },
    
    listViewed: (count: number, duration?: number) => {
      log(LogLevel.DEBUG, `Categories list viewed: ${count} categories`, 200, duration)
    },
    
    viewed: (name: string, duration?: number) => {
      log(LogLevel.DEBUG, `Category viewed: "${name}"`, 200, duration)
    },
    
    duplicateNameAttempt: (name: string) => {
      log(LogLevel.WARN, `Duplicate category name: "${name}"`, 400)
    },
  },
  
  // =========================================
  // Cart
  // =========================================
  cart: {
    itemAdded: (minecraftName: string, productName: string, quantity: number) => {
      log(LogLevel.INFO, `${minecraftName} added "${productName}" x${quantity} to cart`, 200)
    },
    
    itemRemoved: (minecraftName: string, productName: string) => {
      log(LogLevel.INFO, `${minecraftName} removed "${productName}" from cart`, 200)
    },
    
    quantityChanged: (minecraftName: string, productName: string, oldQty: number, newQty: number) => {
      const change = newQty > oldQty ? `+${newQty - oldQty}` : `${newQty - oldQty}`
      log(LogLevel.INFO, `${minecraftName} changed "${productName}": ${oldQty} -> ${newQty} (${change})`, 200)
    },
    
    cleared: (minecraftName: string, itemCount: number) => {
      log(LogLevel.INFO, `${minecraftName} cleared cart (${itemCount} items)`, 200)
    },
    
    saved: (minecraftName: string, itemCount: number, duration?: number) => {
      log(LogLevel.DEBUG, `Cart saved for ${minecraftName}: ${itemCount} items`, 200, duration)
    },
    
    loaded: (minecraftName: string, itemCount: number, duration?: number) => {
      log(LogLevel.DEBUG, `Cart loaded for ${minecraftName}: ${itemCount} items`, 200, duration)
    },
  },
  
  // =========================================
  // Upload
  // =========================================
  upload: {
    started: (filename: string, size: number) => {
      log(LogLevel.INFO, `Upload started: ${filename} (${Math.round(size/1024)} KB)`, 200)
    },
    
    success: (filename: string, size: number, duration?: number) => {
      log(LogLevel.INFO, `Upload complete: ${filename} (${Math.round(size/1024)} KB)`, 200, duration)
    },
    
    rejected: (reason: string, details?: string) => {
      log(LogLevel.SECURITY, `Upload rejected: ${reason}${details ? ` (${details})` : ''}`, 400)
    },
    
    processing: (filename: string) => {
      log(LogLevel.DEBUG, `Processing image: ${filename}...`, 200)
    },
  },
  
  // =========================================
  // Redis
  // =========================================
  redis: {
    connected: () => {
      log(LogLevel.INFO, `Redis connected successfully`, 200)
    },
    
    error: (message: string) => {
      log(LogLevel.ERROR, `Redis connection error: ${message}`, 500)
    },
    
    rateLimit: (key: string, limit: number) => {
      log(LogLevel.WARN, `Rate limit exceeded: ${key} (limit: ${limit})`, 429)
    },
  },

  // =========================================
  // RCON
  // =========================================
  rcon: {
    connecting: (host: string) => {
      log(LogLevel.DEBUG, `RCON connecting to ${host}...`, 200)
    },
    
    connected: (host: string) => {
      log(LogLevel.DEBUG, `RCON connected: ${host}`, 200)
    },
    
    executing: (playerName: string, commandCount: number) => {
      log(LogLevel.INFO, `Executing ${commandCount} commands for ${playerName}...`, 200)
    },
    
    executed: (playerName: string, commandCount: number, duration?: number) => {
      log(LogLevel.INFO, `${commandCount} commands executed for ${playerName}`, 200, duration)
    },
    
    failed: (playerName: string, error: string) => {
      log(LogLevel.ERROR, `RCON failed for ${playerName}: ${maskSensitiveData(error)}`, 500)
    },
    
    commandBlocked: (command: string, playerName: string) => {
      log(LogLevel.SECURITY, `Dangerous command blocked: "${command}" from ${playerName}`, 403)
    },
    
    playerVerified: (playerName: string, lastSeen?: string) => {
      log(LogLevel.DEBUG, `Player verified: ${playerName}${lastSeen ? ` (last seen: ${lastSeen})` : ''}`, 200)
    },
    
    playerNotFound: (playerName: string) => {
      log(LogLevel.WARN, `Player not found: ${playerName}`, 404)
    },
    
    // New detailed logs for item delivery
    commandSent: (playerName: string, command: string) => {
      log(LogLevel.DEBUG, `RCON command sent to ${playerName}: ${maskSensitiveData(command)}`, 200)
    },
    
    commandResponse: (playerName: string, command: string, response: string) => {
      log(LogLevel.DEBUG, `RCON response for ${playerName}: "${response || '(empty)'}"`, 200)
    },
    
    commandSuccess: (playerName: string, command: string) => {
      log(LogLevel.INFO, `RCON command success for ${playerName}: ${maskSensitiveData(command)}`, 200)
    },
    
    commandFailed: (playerName: string, command: string, error: string) => {
      log(LogLevel.ERROR, `RCON command failed for ${playerName}: ${maskSensitiveData(command)} - ${error}`, 500)
    },
    
    deliveryStarted: (orderId: number, playerName: string, itemCount: number) => {
      log(LogLevel.INFO, `Starting item delivery for order #${orderId} to ${playerName}: ${itemCount} items`, 200)
    },
    
    deliveryCompleted: (orderId: number, playerName: string, successCount: number, failCount: number) => {
      if (failCount > 0) {
        log(LogLevel.WARN, `Order #${orderId} delivery to ${playerName}: ${successCount} success, ${failCount} failed`, 200)
      } else {
        log(LogLevel.INFO, `Order #${orderId} delivery to ${playerName}: ${successCount} commands completed`, 200)
      }
    },
    
    itemDelivering: (playerName: string, itemName: string, quantity: number) => {
      log(LogLevel.INFO, `Delivering "${itemName}" x${quantity} to ${playerName}...`, 200)
    },
    
    itemDelivered: (playerName: string, itemName: string, quantity: number) => {
      log(LogLevel.INFO, `Delivered "${itemName}" x${quantity} to ${playerName}`, 200)
    },
  },
  
  // =========================================
  // Security
  // =========================================
  security: {
    invalidInput: (field: string, value: string) => {
      log(LogLevel.SECURITY, `Invalid input: ${field} = "${value.slice(0, 30)}"`, 400)
    },
    
    accessDenied: (resource: string, reason: string) => {
      log(LogLevel.SECURITY, `Access denied to ${resource}: ${reason}`, 403)
    },
    
    suspiciousActivity: (description: string, minecraftName?: string) => {
      const user = minecraftName ? ` user: ${minecraftName}` : ''
      log(LogLevel.SECURITY, `Suspicious activity: ${description}${user}`, 400)
    },
    
    priceManipulation: (claimed: number, calculated: number, minecraftName: string) => {
      log(LogLevel.SECURITY, `Price manipulation attempt by ${minecraftName}: claimed ${claimed}, actual ${calculated}`, 400)
    },
    
    rateLimitExceeded: (endpoint: string) => {
      log(LogLevel.SECURITY, `Rate limit exceeded: ${endpoint}`, 429)
    },
  },
  
  // =========================================
  // System
  // =========================================
  system: {
    startup: () => {
      log(LogLevel.INFO, `Server starting...`, 200)
    },
    
    ready: (port: number) => {
      log(LogLevel.INFO, `Server ready on port ${port}`, 200)
    },
    
    shutdown: () => {
      log(LogLevel.INFO, `Server shutting down...`, 200)
    },
    
    error: (message: string) => {
      log(LogLevel.ERROR, `System error: ${message}`, 500)
    },
  },
}

// Helper to get client IP from request
export function getClientIP(headers: Headers): string {
  // ถ้าอยู่หลัง Cloudflare → ใช้ cf-connecting-ip (เชื่อถือได้มากที่สุด)
  const cfConnecting = headers.get('cf-connecting-ip')
  if (cfConnecting) return cfConnecting.trim()

  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    // H2 Fix: ใช้ rightmost IP (สุดท้าย) แทน leftmost เพื่อป้องกัน IP spoofing
    const parts = forwarded.split(',')
    return parts[parts.length - 1].trim()
  }
  
  const realIP = headers.get('x-real-ip')
  if (realIP) {
    return realIP.trim()
  }

  return 'unknown'
}

// Performance timer helper
export function createTimer(): () => number {
  const start = Date.now()
  return () => Date.now() - start
}
