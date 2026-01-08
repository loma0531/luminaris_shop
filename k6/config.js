/**
 * K6 Load Testing - Configuration
 * ================================
 * ไฟล์ config กลางสำหรับ k6 tests
 */

// Base URL - ใช้ environment variable หรือ default เป็น localhost:3000
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Default Options
export const defaultOptions = {
  // Thresholds ทั่วไป
  thresholds: {
    // 95% ของ requests ต้องเสร็จใน 500ms
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    // Error rate ต้องต่ำกว่า 1%
    http_req_failed: ['rate<0.01'],
    // Request rate ขั้นต่ำ
    http_reqs: ['rate>10'],
  },
};

// API Endpoints
export const endpoints = {
  // Public endpoints
  health: '/api/health',
  products: '/api/products',
  categories: '/api/categories',
  stats: '/api/stats',
  
  // Session-based endpoints
  cart: '/api/cart',
  shopInit: '/api/shop/init',
  
  // Order endpoints
  orders: '/api/orders',
  ordersUser: '/api/orders/user',
  ordersLatest: '/api/orders/latest',
  csrf: '/api/orders/csrf',
  checkout: '/api/orders/checkout',
  
  // Payment endpoints
  payments: '/api/payments',
  promptpay: '/api/promptpay',
  
  // Admin endpoints (ต้อง auth)
  adminLogin: '/api/admin/login',
  adminVerify: '/api/admin/verify',
  adminSales: '/api/admin/sales',
};

// สร้าง session ID สำหรับ cart testing
export function generateSessionId() {
  return `k6-session-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

// Default headers
export function getHeaders(sessionId = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  
  if (sessionId) {
    headers['Cookie'] = `session_id=${sessionId}`;
  }
  
  return headers;
}

// VU Stages configurations
export const stages = {
  smoke: [
    { duration: '30s', target: 1 },
  ],
  
  load: [
    { duration: '1m', target: 20 },   // ramp up
    { duration: '3m', target: 20 },   // steady
    { duration: '1m', target: 50 },   // peak
    { duration: '2m', target: 50 },   // peak steady
    { duration: '1m', target: 20 },   // ramp down
    { duration: '1m', target: 0 },    // cool down
  ],
  
  stress: [
    { duration: '1m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '2m', target: 150 },
    { duration: '2m', target: 200 },
    { duration: '2m', target: 0 },
  ],
  
  spike: [
    { duration: '30s', target: 10 },
    { duration: '10s', target: 200 },  // spike!
    { duration: '1m', target: 200 },
    { duration: '30s', target: 10 },
    { duration: '30s', target: 0 },
  ],
  
  soak: [
    { duration: '2m', target: 30 },
    { duration: '30m', target: 30 },   // long duration
    { duration: '2m', target: 0 },
  ],
};
