# Luminaris Shop 🛒

ระบบร้านค้าสำหรับเซิร์ฟเวอร์ Minecraft รูปแบบใหม่ ที่ถูกออกแบบมาให้ปลอดภัย รวดเร็ว และรองรับช่องทางการชำระเงินที่ทันสมัย

## ✨ Features
- **Stripe Integration**: รองรับการรับชำระเงินผ่านระบบ Stripe (PromptPay, Credit Card) แบบ Embedded UI
- **TrueMoney Voucher**: รองรับระบบเติมเงินผ่านซองอั่งเปา TrueMoney Wallet อัตโนมัติ
- **Service-Repository Pattern**: โครงสร้างแบบ Enterprise
  - `OrderService`, `FulfillmentService`, `PaymentService`
  - `OrderRepository`, `ProductRepository`, `CartRepository`
- **Optional Redis Cache**: มีระบบ Cache Adapter ที่สามารถสลับได้ระหว่าง Redis และ In-Memory 
- **Auto Fulfillment**: เมื่อการชำระเงินสำเร็จ ไอเทมและคำสั่งจะถูกส่งไปยังเซิร์ฟเวอร์ Minecraft อัตโนมัติ (ผ่าน RCON)
- **Retry Mechanism**: หากส่งไอเทมไม่สำเร็จ (เซิร์ฟเวอร์ปิด / ผู้เล่นออฟไลน์) ระบบจะนำเข้าคิวเพื่อส่งใหม่ให้ภายหลัง
- **Security Headers & Rate Limiting**: ป้องกันการ Spam API (Edge Middleware & API Route Rate Limiter)

## 🛠 Tech Stack
- Next.js 14 (App Router)
- React 18, TypeScript, Tailwind CSS
- Prisma ORM + MongoDB
- Stripe (Payments)
- ioredis (Caching)
- rcon-client (Minecraft Integration)

## 📦 การติดตั้ง (Installation)

1. ติดตั้ง Dependencies:
   ```bash
   bun install
   ```

2. คัดลอกและตั้งค่า Environment Variables:
   ```bash
   cp env.template .env
   ```
   *แก้ไขไฟล์ `.env` โดยใส่ค่า Database, Stripe Keys, และ RCON*

3. Push Database Schema:
   ```bash
   bunx prisma db push
   ```

4. เริ่มต้นระบบ:
   ```bash
   bun run dev
   ```

## 🔐 สิทธิ์ Admin
การเข้าถึงหน้า `/admin` ต้องใส่รหัสผ่านใน LocalStorage (ดูรหัสผ่านในไฟล์ `src/lib/adminAuth.ts` หรือ `ADMIN_TOKEN` ใน `.env`)
