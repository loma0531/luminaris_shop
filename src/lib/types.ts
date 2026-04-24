/**
 * Centralized Type Definitions
 * ประเภทข้อมูลที่ใช้ร่วมกันทั้งระบบ
 */

// =========================================
// Order Types
// =========================================

export interface OrderItem {
  productId: string
  name: string
  price: number
  quantity: number
  commands: string[]
  customInput?: string | null  // สำหรับบริการที่ต้องการ input เพิ่มเติม เช่น โค้ดสี
}

export interface CartItemData {
  productId: string
  quantity: number
  customInput?: string | null
}

export interface OrderWithItems {
  id: string
  orderId: number
  minecraftName: string
  items: OrderItem[]
  total: number
  status: OrderStatus
  isDelivered: boolean
  deliveryAttempts: number
  paymentId: string | null
  createdAt: Date
  updatedAt: Date
}

export type OrderStatus = 'PENDING' | 'AWAITING_PAYMENT' | 'COMPLETED' | 'CANCELLED'
export type PaymentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED'
export type QueueStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

// =========================================
// Payment Types
// =========================================

export interface PaymentData {
  id: string
  paymentId: number
  minecraftName: string
  amount: number
  paymentMethod: string | null
  stripeSessionId: string | null
  stripePaymentIntentId: string | null
  status: PaymentStatus
  verifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// =========================================
// Product Types
// =========================================

export interface ProductData {
  id: string
  name: string
  description: string | null
  price: number
  image: string | null
  categoryId: string
  commands: string[]
  soldCount: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CategoryData {
  id: string
  name: string
  description: string | null
  icon: string | null
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

// =========================================
// RCON Types
// =========================================

export interface RconResult {
  success: boolean
  results: string[]
}

export interface DeliveryResult {
  item: string
  success: boolean
  error?: string
}

// =========================================
// API Response Types
// =========================================

export interface ApiError {
  error: string
  code?: string
}

export interface ApiSuccess<T = unknown> {
  success: true
  data?: T
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  totalPages: number
}

// =========================================
// Auth Types
// =========================================

export interface TokenPayload {
  type: 'admin' | 'shop'
  createdAt: number
  nonce: string
  minecraftName?: string
}

export interface TokenVerificationResult {
  valid: boolean
  error?: string
  payload?: TokenPayload
}

// =========================================
// Health Check Types
// =========================================

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded'
  timestamp: string
  checks: {
    mongodb: boolean
    mysql: boolean
    redis: boolean
  }
  version: string
}

// =========================================
// Queue Types
// =========================================

export interface QueuedCommand {
  id: string
  command: string
  minecraftName: string
  orderId: string
  status: QueueStatus
  retryCount: number
  maxRetries: number
  lastError: string | null
  createdAt: Date
  updatedAt: Date
}
