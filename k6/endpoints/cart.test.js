/**
 * K6 Cart API Test
 * =================
 * ทดสอบเฉพาะ Cart API อย่างละเอียด
 * 
 * รัน: k6 run k6/endpoints/cart.test.js
 */

import { sleep, group, check } from 'k6';
import http from 'k6/http';
import { Trend, Counter, Rate } from 'k6/metrics';
import { BASE_URL, endpoints, getHeaders, generateSessionId } from '../config.js';

// Custom metrics
const cartGetTime = new Trend('cart_get_time');
const cartAddTime = new Trend('cart_add_time');
const cartUpdateTime = new Trend('cart_update_time');
const cartOperationSuccess = new Rate('cart_operation_success');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 30 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    cart_get_time: ['p(95)<300'],
    cart_add_time: ['p(95)<500'],
    cart_update_time: ['p(95)<500'],
    cart_operation_success: ['rate>0.95'],
  },
};

let products = [];

export function setup() {
  const response = http.get(`${BASE_URL}${endpoints.products}`);
  try {
    const data = JSON.parse(response.body);
    products = data.products || data || [];
  } catch {}
  
  return { products };
}

export default function (data) {
  // Each VU gets unique session
  const sessionId = generateSessionId();
  const headers = getHeaders(sessionId);
  
  // Test 1: Init shop session
  group('Shop Init', () => {
    const response = http.get(`${BASE_URL}${endpoints.shopInit}`, { headers });
    
    const success = check(response, {
      'shop init: status 200': (r) => r.status === 200,
    });
    cartOperationSuccess.add(success);
  });
  
  sleep(0.2);
  
  // Test 2: Get empty cart
  group('GET /api/cart - Empty', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}${endpoints.cart}`, { headers });
    cartGetTime.add(Date.now() - start);
    
    const success = check(response, {
      'get cart: status 200': (r) => r.status === 200,
      'get cart: returns cart object': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
    });
    cartOperationSuccess.add(success);
  });
  
  sleep(0.2);
  
  // Test 3: Add product to cart
  if (data.products && data.products.length > 0) {
    const randomProduct = data.products[Math.floor(Math.random() * data.products.length)];
    
    group('POST /api/cart - Add Item', () => {
      const start = Date.now();
      const response = http.post(
        `${BASE_URL}${endpoints.cart}`,
        JSON.stringify({
          productId: randomProduct.id,
          quantity: 1,
        }),
        { headers }
      );
      cartAddTime.add(Date.now() - start);
      
      const success = check(response, {
        'add to cart: status 200': (r) => r.status === 200,
      });
      cartOperationSuccess.add(success);
    });
    
    sleep(0.2);
    
    // Test 4: Get cart with items
    group('GET /api/cart - With Items', () => {
      const start = Date.now();
      const response = http.get(`${BASE_URL}${endpoints.cart}`, { headers });
      cartGetTime.add(Date.now() - start);
      
      const success = check(response, {
        'get cart with items: status 200': (r) => r.status === 200,
        'get cart with items: has items': (r) => {
          try {
            const cart = JSON.parse(r.body);
            return cart.items && cart.items.length > 0;
          } catch {
            return false;
          }
        },
      });
      cartOperationSuccess.add(success);
    });
    
    sleep(0.2);
    
    // Test 5: Update cart (increase quantity)
    group('POST /api/cart - Update Quantity', () => {
      const start = Date.now();
      const response = http.post(
        `${BASE_URL}${endpoints.cart}`,
        JSON.stringify({
          items: [{
            productId: randomProduct.id,
            quantity: 3,
          }],
        }),
        { headers }
      );
      cartUpdateTime.add(Date.now() - start);
      
      const success = check(response, {
        'update cart: status 200': (r) => r.status === 200,
      });
      cartOperationSuccess.add(success);
    });
  }
  
  sleep(0.5);
}

export function handleSummary(data) {
  console.log('\n========== CART API TEST SUMMARY ==========');
  console.log('🛒 Cart Endpoint Analysis');
  console.log('');
  
  const getTime = data.metrics.cart_get_time;
  const addTime = data.metrics.cart_add_time;
  const updateTime = data.metrics.cart_update_time;
  const successRate = data.metrics.cart_operation_success;
  
  console.log('GET Cart:');
  if (getTime) {
    console.log(`  Avg: ${(getTime.values.avg || 0).toFixed(2)}ms`);
    console.log(`  p95: ${(getTime.values['p(95)'] || 0).toFixed(2)}ms`);
  }
  
  console.log('ADD to Cart:');
  if (addTime) {
    console.log(`  Avg: ${(addTime.values.avg || 0).toFixed(2)}ms`);
    console.log(`  p95: ${(addTime.values['p(95)'] || 0).toFixed(2)}ms`);
  }
  
  console.log('UPDATE Cart:');
  if (updateTime) {
    console.log(`  Avg: ${(updateTime.values.avg || 0).toFixed(2)}ms`);
    console.log(`  p95: ${(updateTime.values['p(95)'] || 0).toFixed(2)}ms`);
  }
  
  console.log('');
  console.log(`Success Rate: ${((successRate?.values?.rate || 0) * 100).toFixed(2)}%`);
  
  console.log('============================================\n');
  
  return {};
}
