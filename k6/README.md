# K6 Load Testing

ระบบ Load Testing สำหรับ Luminaris Shop โดยใช้ [k6](https://k6.io/)

## 📁 โครงสร้างโฟลเดอร์

```
k6/
├── config.js              # ค่า config กลาง (endpoints, thresholds, stages)
├── README.md              # ไฟล์นี้
│
├── lib/                   # Helper functions
│   ├── helpers.js         # Utility functions
│   └── api.js             # API wrapper functions
│
├── scenarios/             # Test scenarios หลัก
│   ├── smoke.test.js      # Smoke Test - ทดสอบเบื้องต้น
│   ├── load.test.js       # Load Test - ทดสอบโหลดปกติ
│   ├── stress.test.js     # Stress Test - หา breaking point
│   ├── spike.test.js      # Spike Test - ทดสอบ traffic spike
│   └── soak.test.js       # Soak Test - ทดสอบ stability ระยะยาว
│
└── endpoints/             # Endpoint-specific tests
    ├── products.test.js   # Products API
    ├── cart.test.js       # Cart API
    ├── orders.test.js     # Orders API
    └── health.test.js     # Health & Stats API
```

## 🚀 วิธีใช้งาน

### ติดตั้ง k6

```bash
# Ubuntu/Debian
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# หรือ macOS
brew install k6
```

### รัน Tests

```bash
# Smoke Test (แนะนำรันก่อน)
bun run k6:smoke

# Load Test
bun run k6:load

# Stress Test
bun run k6:stress

# Spike Test
bun run k6:spike

# Soak Test (ใช้เวลานาน ~35 นาที)
bun run k6:soak

# Endpoint-specific tests
bun run k6:products
bun run k6:cart
bun run k6:orders
bun run k6:health
```

### ปรับแต่ง Base URL

```bash
# Default: http://localhost:3000
BASE_URL=http://your-server:port k6 run k6/scenarios/smoke.test.js
```

## 📊 ประเภท Test

### 1. Smoke Test

- **วัตถุประสงค์**: ตรวจสอบว่าระบบทำงานได้เบื้องต้น
- **VUs**: 1
- **ระยะเวลา**: 30 วินาที
- **ใช้เมื่อ**: ก่อน deploy, หลังแก้ bug

### 2. Load Test

- **วัตถุประสงค์**: ทดสอบการรองรับโหลดปกติ
- **VUs**: 20-50
- **ระยะเวลา**: ~9 นาที
- **ใช้เมื่อ**: ทดสอบ performance ทั่วไป

### 3. Stress Test

- **วัตถุประสงค์**: หา breaking point ของระบบ
- **VUs**: สูงสุด 200
- **ระยะเวลา**: ~9 นาที
- **ใช้เมื่อ**: ต้องการรู้ขีดจำกัดของระบบ

### 4. Spike Test

- **วัตถุประสงค์**: ทดสอบการรับมือกับ traffic spike
- **VUs**: 10 → 200 → 10
- **ระยะเวลา**: ~3 นาที
- **ใช้เมื่อ**: เตรียมรับ event พิเศษ

### 5. Soak Test

- **วัตถุประสงค์**: หา memory leaks และ performance degradation
- **VUs**: 30
- **ระยะเวลา**: ~35 นาที
- **ใช้เมื่อ**: ตรวจสอบ stability ก่อน production

## 📈 Thresholds

| Metric            | Smoke   | Load    | Stress   |
| ----------------- | ------- | ------- | -------- |
| p95 Response Time | < 300ms | < 500ms | < 2000ms |
| Error Rate        | < 0.1%  | < 5%    | < 20%    |
| Requests/sec      | > 10    | > 10    | N/A      |

## 🔧 Customization

### เพิ่ม Custom Threshold

แก้ไข `config.js`:

```javascript
export const defaultOptions = {
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    http_req_failed: ["rate<0.01"],
    // เพิ่ม custom threshold
    "http_req_duration{name:products}": ["p(95)<300"],
  },
};
```

### เพิ่ม Endpoint ใหม่

เพิ่มใน `config.js`:

```javascript
export const endpoints = {
  // existing endpoints...
  newEndpoint: "/api/your-new-endpoint",
};
```

สร้าง function ใน `lib/api.js`:

```javascript
export function getNewEndpoint() {
  const response = http.get(`${BASE_URL}${endpoints.newEndpoint}`);
  // ...
}
```

## 📝 Output

k6 จะแสดงผลลัพธ์หลังจบ test:

```
✓ health check: status 200
✓ health check: response < 100ms

checks.....................: 100.00% ✓ 240 ✗ 0
http_req_duration..........: avg=45.2ms min=12ms p(95)=89ms max=234ms
http_req_failed............: 0.00%   ✓ 0   ✗ 240
http_reqs..................: 240     8/s
```

## 🔗 ลิงก์ที่เกี่ยวข้อง

- [k6 Documentation](https://k6.io/docs/)
- [k6 Threshold Reference](https://k6.io/docs/using-k6/thresholds/)
- [k6 Options Reference](https://k6.io/docs/using-k6/k6-options/)
