# Luminaris Shop 🛒

ระบบร้านค้าออนไลน์สำหรับเซิร์ฟเวอร์ Minecraft รองรับการเชื่อมต่อ RCON, ระบบตะกร้าสินค้า, และการจัดการหลังบ้านครบวงจร

## 📋 สิ่งที่ต้องมีเบื้องต้น (Prerequisites)

ก่อนเริ่มติดตั้ง โปรดตรวจสอบว่าเครื่องของคุณได้ติดตั้งสิ่งเหล่านี้แล้ว:

- [Node.js](https://nodejs.org/) (เวอร์ชัน 18 ขึ้นไป recommended)
- [Bun](https://bun.sh/) (Runtime หลักของโปรเจกต์นี้)
- [MySQL](https://www.mysql.com/) หรือ MariaDB (สำหรับดึงข้อมูลจากเซิร์ฟเวอร์ Minecraft)
- [MongoDB](https://www.mongodb.com/) (สำหรับเก็บข้อมูลของผู้ใช้)
- [Redis](https://redis.io/) (สำหรับ Caching และ Queue)
- [SlipOK](https://slipok.com) (สำหรับการจัดการการชำระเงินหลังบ้าน)

---

## 🛠️ ขั้นตอนการติดตั้ง (Installation)

### 1. Clone Repository

ดึงโค้ดจาก Git ลงมาที่เครื่องของคุณ:

```bash
git clone https://github.com/loma0531/luminaris_shop.git
cd luminaris_shop
```

### 2. ติดตั้งแพ็กเกจ (Install Dependencies)

ใช้ Bun ในการลงแพ็กเกจต่างๆ:

```bash
bun install
```

### 3. ตั้งค่า Environment Variables

คัดลอกไฟล์ `.env.template` ไปเป็น `.env` และแก้ไขข้อมูลให้ตรงกับเครื่องของคุณ:

```bash
cp .env.template .env
```

**สิ่งที่ต้องแก้ไขใน .env:**

- `DATABASE_URL`: ลิงก์เชื่อมต่อ MySQL (เช่น `mysql://user:pass@localhost:3306/luminaris_shop`)
- `REDIS_URL`: ลิงก์เชื่อมต่อ Redis (เช่น `redis://localhost:6379`)
- `RCON_HOST`, `RCON_PORT`, `RCON_PASSWORD`: ข้อมูลเชื่อมต่อ RCON ของเซิร์ฟเวอร์ Minecraft
- `NEXT_PUBLIC_BASE_URL`: URL ของเว็บ (เช่น `http://localhost:3000` หรือโดเมนจริง)

### 4. ตั้งค่าฐานข้อมูล (Database Setup)

สร้างตารางในฐานข้อมูลด้วย Prisma:

```bash
# สร้าง Prisma Client
bun x prisma generate

# อัปเดตตารางใน Database ให้ตรงกับ Schema
bun x prisma db push
```

หากใช้เวลานาน ลองเปลี่ยนไปใช้ npx แทน

```bash
npx prisma generate
```

```bash
npx prisma db push
```

### 5. สร้าง Admin (Create Admin)

รันสคริปต์เพื่อสร้างบัญชีผู้ดูแลระบบ (สำหรับเข้าหน้า Admin Panel):

```bash
bun scripts/create-admin.ts
```

Username และ Password จะใช้จาก .env ที่ตั้งไว้

## 🚀 การรันโปรเจกต์ (Running)

### แบบ Development (สำหรับแก้ไขโค้ด)

```bash
bun dev
```

เข้าเว็บที่: `http://localhost:3000`

### แบบ Production (สำหรับใช้งานจริง)

1. **Build โปรเจกต์:**
   ```bash
   bun run build
   ```
2. **Start Server:**
   ```bash
   bun start
   ```

---

## 📂 โครงสร้างโปรเจกต์ (Structure)

- `src/app`: หน้าเว็บและ API ทั้งหมด (Next.js App Router)
- `src/lib`: ฟังก์ชันตัวช่วยต่างๆ (Database, RCON, Auth)
- `prisma`: Schema ของฐานข้อมูล
- `scripts`: สคริปต์สำหรับจัดการระบบ (Clear Cache, Create Admin)
- `public`: ไฟล์รูปภาพและ Static Files

## 🔧 คำสั่งอื่นๆ ที่ควรรู้

- **ล้าง Cache (Redis):** `bun scripts/clear-cache.ts`
- **ล้างฐานข้อมูล (Reset DB):** `bun scripts/reset-database.ts` (⚠️ ข้อมูลหายหมด)
