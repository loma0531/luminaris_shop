/**
 * Order Configuration
 * ตั้งค่าเวลาสำหรับระบบ Order ที่นี่
 */

export const ORDER_CONFIG = {
  /**
   * ระยะเวลาที่ให้ชำระเงิน (เป็นนาที)
   * เมื่อหมดเวลา order จะถูกยกเลิกอัตโนมัติ
   */
  PAYMENT_TIMEOUT_MINUTES: 60,

  /**
   * ระยะเวลาที่ให้ชำระเงิน (เป็น milliseconds)
   * ใช้ในการคำนวณ - อย่าแก้ไขโดยตรง
   */
  get PAYMENT_TIMEOUT_MS() {
    return this.PAYMENT_TIMEOUT_MINUTES * 60 * 1000
  },
} as const
