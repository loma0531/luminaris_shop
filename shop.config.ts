/**
 * ==========================================
 * Luminaris Shop Configuration
 * ==========================================
 * ไฟล์ตั้งค่าหลักของร้านค้า
 * คุณสามารถปรับแต่งค่าต่างๆ ได้ที่นี่โดยไม่ต้องไปแก้โค้ดหลัก
 */

export const shopConfig = {
  // ------------------------------------------
  // 1. General Settings (ตั้งค่าทั่วไป)
  // ------------------------------------------
  shop: {
    name: "Luminaris Shop",
    description: "ร้านค้าไอเทม Minecraft สำหรับเซิร์ฟเวอร์ Luminaris",
    currency: "THB",
    currencySymbol: "฿",
    contactDiscord: "https://discord.gg/luminaris",
  },

  // ------------------------------------------
  // 2. Security Settings (ตั้งค่าความปลอดภัย)
  // ------------------------------------------
  security: {
    // ความยาวสูงสุดของข้อความ Custom Input ที่ผู้เล่นกรอกได้
    maxCustomInputLength: 1000,
    
    // คำสั่งที่ห้ามรันผ่านระบบร้านค้าเด็ดขาด (ใช้ Regular Expression)
    // จะป้องกันไม่ให้ผู้เล่นใช้ช่องโหว่รันคำสั่งเหล่านี้ได้
    dangerousCommandPatterns: [
      '^op\\s+',
      '^deop\\s+',
      '^stop$',
      '^ban\\s+',
      '^pardon\\s+',
      '^whitelist\\s+',
      '^kick\\s+',
      '^gamemode\\s+',
      '^tp\\s+'
    ]
  },

  // ------------------------------------------
  // 3. Order & Payment Settings (ตั้งค่าการสั่งซื้อ)
  // ------------------------------------------
  orders: {
    // เวลาหมดอายุของออเดอร์ หากยังไม่ชำระเงิน (นาที)
    paymentTimeoutMinutes: 60,
    
    // ช่องทางการชำระเงินที่เปิดใช้งาน
    payments: {
      truewallet: {
        enabled: true,
        feePercentage: 0 // ค่าธรรมเนียม (%)
      },
      promptpay: {
        enabled: true
      },
      creditCard: {
        enabled: false,
        feePercentage: 0 // ค่าธรรมเนียม (%)
      }
    }
  },

  // ------------------------------------------
  // 4. RCON & Queue Settings (ตั้งค่าการส่งของ)
  // ------------------------------------------
  rcon: {
    // จำนวนครั้งสูงสุดที่จะลองส่งคำสั่งซ้ำ หากรอบแรกส่งไม่สำเร็จ
    maxRetries: 5,
    
    // เวลาที่ RCON จะถูกปิดอัตโนมัติหากไม่มีการส่งของ (มิลลิวินาที)
    poolMaxIdleTimeMs: 30000
  },

  // ------------------------------------------
  // 5. Rate Limit Settings (ตั้งค่าป้องกัน Spam/DDoS)
  // ------------------------------------------
  // windowMs: ระยะเวลา (มิลลิวินาที)
  // maxRequests: จำนวนคำขอสูงสุดที่รับได้ในระยะเวลา windowMs
  rateLimit: {
    upload:     { windowMs: 60000, maxRequests: 10 },
    login:      { windowMs: 60000, maxRequests: 20 },
    adminLogin: { windowMs: 300000, maxRequests: 3 }, // Admin Login ต้องเข้มงวด
    checkout:   { windowMs: 60000, maxRequests: 20 },
    rconVerify: { windowMs: 60000, maxRequests: 5 },  // 5 ครั้ง/นาที
    rcon:       { windowMs: 60000, maxRequests: 10 },
    users:      { windowMs: 300000, maxRequests: 10 },
    default:    { windowMs: 60000, maxRequests: 100 }
  }
} as const;

export type ShopConfig = typeof shopConfig;
