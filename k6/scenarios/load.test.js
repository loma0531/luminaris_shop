/**
 * K6 Load Test
 * =============
 * ทดสอบโหลดปกติของระบบ
 * 
 * รัน: k6 run k6/scenarios/load.test.js
 */

import { sleep, group } from 'k6';
import { BASE_URL, stages, defaultOptions, generateSessionId } from '../config.js';
import { 
  healthCheck, 
  getProducts, 
  getCategories, 
  getStats,
  initShop,
  getCart,
  addToCart,
} from '../lib/api.js';
import { randomSleep, randomProductSelection } from '../lib/helpers.js';

export const options = {
  stages: stages.load,
  thresholds: {
    ...defaultOptions.thresholds,
    // Custom thresholds for load test
    http_req_duration: ['p(95)<500', 'p(99)<1500', 'avg<300'],
    http_req_failed: ['rate<0.05'], // ยอมรับ error 5%
  },
  noConnectionReuse: false,
  userAgent: 'K6LoadTest/1.0',
};

// Setup - ทำครั้งเดียวตอนเริ่ม
export function setup() {
  console.log('Setting up load test...');
  
  // ดึง products และ categories สำหรับใช้ใน test
  const products = getProducts({ limit: 50 });
  const categories = getCategories();
  
  return {
    products: products.products || [],
    categories: categories.categories || [],
  };
}

export default function (data) {
  const sessionId = generateSessionId();
  
  // Scenario 1: Browse Products (50% weight)
  group('Browse Products', () => {
    getProducts();
    randomSleep(0.5, 1);
    
    // Filter by category
    if (data.categories && data.categories.length > 0) {
      const randomCategory = data.categories[Math.floor(Math.random() * data.categories.length)];
      if (randomCategory && randomCategory.id) {
        getProducts({ category: randomCategory.id });
      }
    }
    randomSleep(0.3, 0.8);
  });
  
  // Scenario 2: Shopping Flow (30% weight)
  if (Math.random() < 0.5) {
    group('Shopping Flow', () => {
      // Init shop
      initShop(sessionId);
      randomSleep(0.2, 0.5);
      
      // View cart
      getCart(sessionId);
      randomSleep(0.2, 0.5);
      
      // Add random product to cart
      const randomProduct = randomProductSelection(data.products);
      if (randomProduct && randomProduct.id) {
        addToCart(sessionId, randomProduct.id, 1);
      }
      randomSleep(0.5, 1);
      
      // View cart again
      getCart(sessionId);
    });
  }
  
  // Scenario 3: API Health & Stats (20% weight)
  if (Math.random() < 0.3) {
    group('Health & Stats', () => {
      healthCheck();
      randomSleep(0.1, 0.3);
      
      getStats();
      randomSleep(0.1, 0.3);
    });
  }
  
  // Wait between iterations
  randomSleep(1, 3);
}

export function teardown(data) {
  console.log('Load test completed.');
}

export function handleSummary(data) {
  const summary = {
    totalRequests: data.metrics.http_reqs?.values?.count || 0,
    failedRate: ((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2),
    avgDuration: (data.metrics.http_req_duration?.values?.avg || 0).toFixed(2),
    p95Duration: (data.metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(2),
    p99Duration: (data.metrics.http_req_duration?.values?.['p(99)'] || 0).toFixed(2),
    maxDuration: (data.metrics.http_req_duration?.values?.max || 0).toFixed(2),
    reqPerSec: (data.metrics.http_reqs?.values?.rate || 0).toFixed(2),
  };
  
  console.log('\n========== LOAD TEST SUMMARY ==========');
  console.log(`Total Requests: ${summary.totalRequests}`);
  console.log(`Requests/sec: ${summary.reqPerSec}`);
  console.log(`Failed Rate: ${summary.failedRate}%`);
  console.log(`Avg Response Time: ${summary.avgDuration}ms`);
  console.log(`p95 Response Time: ${summary.p95Duration}ms`);
  console.log(`p99 Response Time: ${summary.p99Duration}ms`);
  console.log(`Max Response Time: ${summary.maxDuration}ms`);
  console.log('========================================\n');
  
  // Check if thresholds passed
  const passed = data.metrics.http_req_failed?.values?.rate < 0.05 && 
                 data.metrics.http_req_duration?.values?.['p(95)'] < 500;
  
  console.log(passed ? '✅ All thresholds PASSED' : '❌ Some thresholds FAILED');
  
  return {};
}
