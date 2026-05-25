/**
 * Order Configuration
 * ไฟล์นี้ดึงการตั้งค่ามาจาก shop.config.json
 * หากต้องการแก้ไขตั้งค่า ให้ไปแก้ไขที่ไฟล์ shop.config.json ที่ root directory
 */
import { getShopConfig } from './config'

export const ORDER_CONFIG = {
  get PAYMENT_TIMEOUT_MINUTES() {
    return getShopConfig().orders.paymentTimeoutMinutes
  },

  /**
   * ระยะเวลาที่ให้ชำระเงิน (เป็น milliseconds)
   * ใช้ในการคำนวณ - อย่าแก้ไขโดยตรง
   */
  get PAYMENT_TIMEOUT_MS() {
    return this.PAYMENT_TIMEOUT_MINUTES * 60 * 1000
  },
} as const
