/**
 * K6 Stress Test
 * ===============
 * ทดสอบขีดจำกัดของระบบ - หา breaking point
 * 
 * รัน: k6 run k6/scenarios/stress.test.js
 */

import { sleep, group, check } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { BASE_URL, stages, generateSessionId } from '../config.js';
import { 
  healthCheck, 
  getProducts, 
  getCategories,
  initShop,
  getCart,
  addToCart,
} from '../lib/api.js';

// Custom metrics for stress analysis
const errorsByVUs = new Counter('errors_by_vus');
const responseTimeByVUs = new Trend('response_time_by_vus');
const successRateByVUs = new Rate('success_rate_by_vus');

export const options = {
  stages: stages.stress,
  thresholds: {
    // Stress test มี thresholds หย่อนกว่า
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.20'], // ยอมรับ error 20%
  },
  noConnectionReuse: false,
};

export function setup() {
  console.log('Setting up stress test...');
  console.log('WARNING: This test will push the system to its limits!');
  
  const products = getProducts({ limit: 100 });
  return {
    products: products.products || [],
  };
}

export default function (data) {
  const sessionId = generateSessionId();
  const vus = __VU;
  
  group('Products Endpoint Stress', () => {
    const start = Date.now();
    const result = getProducts();
    const duration = Date.now() - start;
    
    responseTimeByVUs.add(duration, { vus: vus });
    
    if (!result.success) {
      errorsByVUs.add(1, { vus: vus });
      successRateByVUs.add(false);
    } else {
      successRateByVUs.add(true);
    }
  });
  
  sleep(0.1);
  
  group('Categories Endpoint Stress', () => {
    const result = getCategories();
    if (!result.success) {
      errorsByVUs.add(1, { vus: vus });
    }
  });
  
  sleep(0.1);
  
  group('Cart Session Stress', () => {
    initShop(sessionId);
    sleep(0.05);
    
    getCart(sessionId);
    sleep(0.05);
    
    // Try to add product if available
    if (data.products && data.products.length > 0) {
      const randomProduct = data.products[Math.floor(Math.random() * data.products.length)];
      if (randomProduct && randomProduct.id) {
        addToCart(sessionId, randomProduct.id, 1);
      }
    }
  });
  
  sleep(0.2);
  
  // Health check to monitor if system is still responsive
  group('Health Monitor', () => {
    const health = healthCheck();
    if (!health.success) {
      console.error(`Health check failed at VU ${vus}`);
    }
  });
  
  // Minimal sleep to maximize load
  sleep(0.1);
}

export function teardown(data) {
  console.log('Stress test completed.');
}

export function handleSummary(data) {
  console.log('\n========== STRESS TEST SUMMARY ==========');
  console.log('⚠️  STRESS TEST RESULTS');
  console.log('');
  
  const totalReqs = data.metrics.http_reqs?.values?.count || 0;
  const failedRate = ((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2);
  const avgDuration = (data.metrics.http_req_duration?.values?.avg || 0).toFixed(2);
  const p95Duration = (data.metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(2);
  const maxDuration = (data.metrics.http_req_duration?.values?.max || 0).toFixed(2);
  const reqPerSec = (data.metrics.http_reqs?.values?.rate || 0).toFixed(2);
  
  console.log(`Total Requests: ${totalReqs}`);
  console.log(`Peak Requests/sec: ${reqPerSec}`);
  console.log(`Failed Rate: ${failedRate}%`);
  console.log(`Avg Response Time: ${avgDuration}ms`);
  console.log(`p95 Response Time: ${p95Duration}ms`);
  console.log(`Max Response Time: ${maxDuration}ms`);
  console.log('');
  
  // Analysis
  if (parseFloat(failedRate) > 10) {
    console.log('❌ HIGH ERROR RATE - System breaking point reached');
  } else if (parseFloat(p95Duration) > 1000) {
    console.log('⚠️  SLOW RESPONSES - Performance degradation detected');
  } else {
    console.log('✅ System handled stress well');
  }
  
  console.log('=========================================\n');
  
  return {};
}
