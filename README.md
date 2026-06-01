# Luminaris Shop

ระบบเว็บร้านค้าสำหรับเซิร์ฟเวอร์ Minecraft ที่เน้นความปลอดภัย ประสิทธิภาพ และความเร็วในการประมวลผลธุรกรรม

---

## สิ่งที่ต้องเตรียมก่อนเริ่มใช้งาน (Prerequisites)

กรุณาเตรียมสภาพแวดล้อมดังต่อไปนี้ให้พร้อมใช้งาน:

1.  **Bun**: ใช้เป็น JS Runtime หลักในการรันและพัฒนาแอปพลิเคชัน
2.  **MongoDB**: ฐานข้อมูลหลักสำหรับจัดเก็บข้อมูลระบบทั้งหมด
3.  **Redis**: สำหรับจัดการระบบแคช (Cache), CSRF Token และ Sequence Generator เพื่อประสิทธิภาพสูงสุด
4.  **Minecraft Server**: ที่เปิดใช้งานพอร์ต RCON ในไฟล์ `server.properties` เพื่อรับคำสั่งส่งไอเทม

---

## ขั้นตอนการติดตั้งและการใช้งาน (Installation & Setup)

### 1. การโคลนคลังโค้ด (Clone Repository)
ดาวน์โหลดซอร์สโค้ดลงมายังเครื่องหลัก:
```bash
git clone https://github.com/luminaworld/luminaris_shop.git
cd luminaris_shop
```

### 2. การติดตั้งโปรแกรมเสริมและโมดูลเชื่อมต่อ (Install Dependencies)
ติดตั้งโมดูลทั้งหมดผ่าน Bun:
```bash
bun install
```

### 3. การกำหนดค่าสภาพแวดล้อม (Configuration)
คัดลอกไฟล์ต้นแบบเพื่อสร้างไฟล์ตั้งค่าเฉพาะระบบ:
```bash
cp env.template .env
```

เปิดไฟล์ `.env` แล้วระบุข้อมูลการเชื่อมต่อให้ถูกต้อง เช่น ค่าการเชื่อมต่อฐานข้อมูล MongoDB, ข้อมูลเชื่อมต่อ Redis และข้อมูล RCON สำหรับเซิร์ฟเวอร์ Minecraft

### 4. การอัปเดตโครงสร้างฐานข้อมูล (Prisma Setup)
ทำการซิงค์โครงสร้างตารางข้อมูลไปยัง MongoDB:
```bash
bunx prisma db push
```

### 5. การเปิดใช้งานระบบ (Running Application)
*   **สำหรับนักพัฒนา (Development)**:
    ```bash
    bun run dev
    ```
*   **สำหรับใช้งานจริง (Production)**:
    ```bash
    bun run build
    ```
    ตามด้วย:
    ```bash
    bun run start
    ```

---

## ขั้นตอนการสร้างบัญชีผู้ดูแลระบบ (Creating Admin User)

ระบบมีสคริปต์อัตโนมัติสำหรับการสร้างหรืออัปเดตข้อมูลบัญชีผู้ดูแลระบบ โดยมีขั้นตอนดังต่อไปนี้:

1.  เปิดไฟล์ `.env` แล้วทำการเพิ่มหรือกำหนดค่าตัวแปรต่อไปนี้ลงไป:
    ```env
    ADMIN_EMAIL="admin@yourdomain.com"
    ADMIN_PASSWORD="your_secure_password"
    ADMIN_TOKEN="your_secure_admin_token"
    ```
2.  รันคำสั่งสำหรับสร้างผู้ดูแลระบบ:
    ```bash
    bun run create-admin
    ```
3.  ระบบจะทำการสร้างบัญชีผู้ดูแลระบบในฐานข้อมูลและสร้างรหัสผ่านพร้อมเข้ารหัส และแสดงคีย์สำหรับตั้งค่า **Google Authenticator (2FA)** บนหน้าจอคอนโซล
