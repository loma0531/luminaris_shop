/**
 * K6 Orders API Test
 * ===================
 * ทดสอบเฉพาะ Orders API อย่างละเอียด
 * 
 * รัน: k6 run k6/endpoints/orders.test.js
 */

import { sleep, group, check } from 'k6';
import http from 'k6/http';
import { Trend, Rate } from 'k6/metrics';
import { BASE_URL, endpoints, getHeaders, generateSessionId } from '../config.js';

// Custom metrics
const csrfTime = new Trend('csrf_token_time');
const userOrdersTime = new Trend('user_orders_time');
const latestOrdersTime = new Trend('latest_orders_time');
const checkoutTime = new Trend('checkout_time');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    csrf_token_time: ['p(95)<200'],
    user_orders_time: ['p(95)<500'],
    latest_orders_time: ['p(95)<300'],
  },
};

export default function () {
  const sessionId = generateSessionId();
  const headers = getHeaders(sessionId);
  
  // Test 1: Get CSRF Token
  group('GET /api/orders/csrf - CSRF Token', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}${endpoints.csrf}`, { headers });
    csrfTime.add(Date.now() - start);
    
    check(response, {
      'csrf: status 200': (r) => r.status === 200,
      'csrf: has token': (r) => {
        try {
          const json = JSON.parse(r.body);
          return json.csrfToken !== undefined;
        } catch {
          return false;
        }
      },
    });
  });
  
  sleep(0.3);
  
  // Test 2: Get User Orders
  group('GET /api/orders/user - User Orders', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}${endpoints.ordersUser}`, { headers });
    userOrdersTime.add(Date.now() - start);
    
    check(response, {
      'user orders: status 200': (r) => r.status === 200,
      'user orders: is array': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body));
        } catch {
          return false;
        }
      },
    });
  });
  
  sleep(0.3);
  
  // Test 3: Get Latest Orders (public)
  group('GET /api/orders/latest - Latest Orders', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}${endpoints.ordersLatest}`, {
      headers: getHeaders(),
    });
    latestOrdersTime.add(Date.now() - start);
    
    check(response, {
      'latest orders: status 200': (r) => r.status === 200,
    });
  });
  
  sleep(0.3);
  
  // Test 4: Checkout attempt (will fail without cart items - just testing endpoint)
  group('POST /api/orders/checkout - Checkout Attempt', () => {
    // Get CSRF token first
    const csrfResponse = http.get(`${BASE_URL}${endpoints.csrf}`, { headers });
    let csrfToken = null;
    try {
      csrfToken = JSON.parse(csrfResponse.body).csrfToken;
    } catch {}
    
    const start = Date.now();
    const response = http.post(
      `${BASE_URL}${endpoints.checkout}`,
      JSON.stringify({
        sessionId,
        csrfToken,
        username: `testuser_${Date.now()}`,
      }),
      { headers }
    );
    checkoutTime.add(Date.now() - start);
    
    // Note: This will likely fail due to empty cart, but we're testing response time
    check(response, {
      'checkout: responds': (r) => r.status !== 0,
      'checkout: quick response': (r) => r.timings.duration < 2000,
    });
  });
  
  sleep(0.5);
}

export function handleSummary(data) {
  console.log('\n========== ORDERS API TEST SUMMARY ==========');
  console.log('📋 Orders Endpoint Analysis');
  console.log('');
  
  const metrics = [
    { name: 'CSRF Token', key: 'csrf_token_time' },
    { name: 'User Orders', key: 'user_orders_time' },
    { name: 'Latest Orders', key: 'latest_orders_time' },
    { name: 'Checkout', key: 'checkout_time' },
  ];
  
  metrics.forEach(m => {
    const metric = data.metrics[m.key];
    if (metric) {
      console.log(`${m.name}:`);
      console.log(`  Avg: ${(metric.values.avg || 0).toFixed(2)}ms`);
      console.log(`  p95: ${(metric.values['p(95)'] || 0).toFixed(2)}ms`);
    }
  });
  
  console.log('=============================================\n');
  
  return {};
}
