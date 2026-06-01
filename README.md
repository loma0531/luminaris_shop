# Luminaris Shop 🛒

**Luminaris Shop** คือระบบเว็บร้านค้าพรีเมียมสำหรับเซิร์ฟเวอร์ Minecraft รูปแบบใหม่ ที่ได้รับการออกแบบตามสถาปัตยกรรมยุคใหม่ เน้นความปลอดภัยสูงสุด (Security) ความเร็วในการทำงาน (Performance) และการประมวลผลธุรกรรมที่ทนทานภายใต้ผู้ใช้งานพร้อมกันจำนวนมาก (**High Concurrency**) 

---

## ✨ คุณสมบัติเด่น (Features)

*   **⚡ High Concurrency Ready**:
    *   **Redis Atomic Sequence**: ใช้ Redis `INCR` ในการออก Sequence ID ของคำสั่งซื้อและยอดชำระเงินแบบเสี้ยววินาที (<1ms) หลีกเลี่ยงการทำ Write Lock บน MongoDB
    *   **RCON Connection Pooling**: ระบบจัดเก็บไอเทมใช้ Connection Pool ในการกักและนำการเชื่อมต่อ TCP กลับมาใช้ซ้ำ ลด Overhead ในการทำ Handshake และ Auth กับตัวเกม
    *   **Bulk DB Operations**: การจัดคิวจัดส่งล้มเหลวแบบกลุ่มผ่าน `createMany` และ `updateMany` ในคราวเดียว ช่วยเซฟทรัพยากรฐานข้อมูลได้มากกว่า 90%
*   **💳 การชำระเงินที่ทันสมัย (Stripe & TrueMoney)**:
    *   **Stripe Integration**: รองรับการชำระเงินผ่านระบบ Stripe (PromptPay, Credit Card) แบบฝังตัวใน UI ที่ราบรื่น
    *   **TrueMoney Wallet**: รองรับระบบรับอั่งเปา (Voucher) เติมเงินเข้ากระเป๋าของร้านค้าอัตโนมัติ
*   **🛡️ ความปลอดภัยขั้นสูง (Enterprise Security)**:
    *   **Anti-Price Manipulation**: ดึงข้อมูลและราคาของจากฝั่งเซิร์ฟเวอร์เท่านั้น เพื่อป้องกันไม่ให้ผู้ใช้แก้ไขราคาหรือส่งคำสั่งอันตรายจากเบราว์เซอร์
    *   **CSRF Protection**: ป้องกันการจู่โจมด้วย CSRF Token ทุกครั้งที่มีการ Checkout
    *   **Rate Limiting**: ระบบคัดกรอง Request ถล่มด้วย In-Memory/Redis Rate Limiter ป้องกันการ Spam API
*   **🏗️ Enterprise Architecture (Service-Repository Pattern)**:
    *   แยกตรรกะทางธุรกิจ (Business Logic) และการดึงข้อมูลอย่างเป็นระเบียบ เช่น `FulfillmentService`, `OrderService`, `CartRepository` เป็นต้น
*   **🔄 Automatic Retry Queue**:
    *   หาก RCON ส่งไอเทมล้มเหลว (ผู้เล่นออฟไลน์ / เน็ตเซิร์ฟเวอร์ตก) ระบบจะบันทึกเข้าคิวอัตโนมัติ และมี Background Worker คอยดึงไปลองส่งใหม่เรื่อยๆ เมื่อผู้เล่นกลับมาออนไลน์

---

## 🛠️ ความต้องการเบื้องต้นของระบบ (Prerequisites)

ก่อนเริ่มต้นใช้งานระบบ Luminaris Shop กรุณาเตรียมส่วนประกอบเหล่านี้ให้พร้อม:

1.  **Bun**: แนะนำให้ใช้ **Bun JS Runtime** (เวอร์ชัน 1.0 ขึ้นไป) ในการรันและพัฒนาเพื่อประสิทธิภาพสูงสุด
2.  **MongoDB**: ฐานข้อมูลหลัก (แนะนำให้ติดตั้งในเครื่องเดียวกับ Web App หรือเลือกใช้บริการ VPS ใกล้เคียงเพื่อ Latency ต่ำที่สุด)
3.  **Redis (ทางเลือก/แนะนำ)**: สำหรับระบบ Caching, CSRF, Rate Limiting และ Sequence Generator เพื่อรองรับ Concurrent สูงสุด
4.  **Minecraft Server**: ที่มีการติดตั้ง Plugin จัดการไอเทม (เช่น EssentialsX) และ**เปิดใช้งาน RCON Port** ใน `server.properties`
5.  **Stripe Account (ทางเลือก)**: บัญชี Stripe สำหรับตั้งค่าการชำระเงินจริงหรือ Sandbox Testing

---

## 📦 การติดตั้งและการตั้งค่าระบบ (Installation & Setup)

### 1. ติดตั้ง Dependencies
แนะนำให้ใช้ Bun ในการติดตั้งโมดูลทั้งหมด:
```bash
bun install
```

### 2. ตั้งค่า Environment Variables
คัดลอกไฟล์ต้นแบบและนำไปแก้ไข:
```bash
cp env.template .env
```

จากนั้นเปิดไฟล์ `.env` เพื่อเพิ่มคีย์การเชื่อมต่อที่สำคัญ:
```env
# Database Settings
DATABASE_URL="mongodb://localhost:27017/luminaris_shop"

# Redis Setup (แนะนำให้เปิดเป็น true เพื่อเปิดใช้ความเร็วระดับ Concurrency)
REDIS_ENABLED="true"
REDIS_URL="redis://127.0.0.1:6379"

# RCON Minecraft Server
RCON_HOST="localhost"
RCON_PORT=25575
RCON_PASSWORD="your_rcon_secure_password"

# Stripe API Keys (หากต้องการทดสอบชำระเงิน)
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Authentication & Admin
ADMIN_TOKEN="your_super_secret_admin_token"
NEXTAUTH_SECRET="test-secret-key"
```

### 3. อัปโหลดโครงสร้างตารางเข้าสู่ฐานข้อมูล (Prisma Sync)
ทำการ Push Schema ไปยัง MongoDB:
```bash
bunx prisma db push
```

---

## 🚀 คำสั่งสำหรับรันระบบ (Commands)

| คำสั่ง | คำอธิบาย |
| :--- | :--- |
| `bun run dev` | รันเซิร์ฟเวอร์สำหรับพัฒนาในโหมด Development (Hot-Reload) ที่พอร์ต 3000 |
| `bun run build` | บิลด์โปรเจกต์ Next.js เป็น Production Bundle เพื่อความเร็วและการประมวลผลสูงสุด |
| `bun run start` | รันโปรเจกต์เวอร์ชัน Production ที่ผ่านการบิลด์เรียบร้อยแล้ว |
| `bun test` | รันชุดการทดสอบทั้งหมดของระบบ (Unit/Integration Tests) ด้วย Vitest บน Bun |

---

## 🔐 สิทธิ์ผู้ดูแลระบบ (Admin Access)

การล็อกอินและเข้าถึงฟีเจอร์หลังบ้านในหน้า `/admin`:
1.  กรอกรหัสผ่านด้วยบัญชีแอดมินที่สร้างไว้ หรือนำเข้าผ่าน `Prisma Studio`
2.  ความปลอดภัยของ Token แอดมินเป็นแบบ **JWT (JSON Web Token)** ที่ได้รับการเข้าแบบครอบคลุมและเก็บรักษาในระบบคุกกี้ที่ปลอดภัยป้องกันการโจรกรรมข้อมูล (Client-Side Manipulation)

---

## 🏗️ โครงสร้างโปรเจกต์ (Project Structure)

```
Luminaris_shop/
├── prisma/                 # Database Schema (schema.prisma)
├── src/
│   ├── app/                # Next.js App Router (Pages, API Endpoints)
│   ├── core/               # Enterprise Layer
│   │   ├── repositories/   # คอนแทคการดึงข้อมูลจาก DB (Product, Cart, Order)
│   │   └── services/       # ตรรกะธุรกิจหลัก (Fulfillment, Order)
│   ├── lib/                # โมดูลอำนวยความสะดวกกลาง
│   │   ├── cache/          # Cache Adapters (Redis, Memory)
│   │   ├── counter.ts      # Optimized ID Generator
│   │   ├── rcon.ts         # Pooled RCON Client
│   │   └── queue-worker.ts # Command Queue Worker
│   └── public/             # Static Assets และรูปภาพระบบ
```
