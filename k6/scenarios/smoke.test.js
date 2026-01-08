/**
 * K6 Smoke Test
 * ==============
 * ทดสอบเบื้องต้นว่าระบบทำงานได้
 * 
 * รัน: k6 run k6/scenarios/smoke.test.js
 */

import { sleep } from 'k6';
import { BASE_URL, stages, defaultOptions } from '../config.js';
import { healthCheck, getProducts, getCategories, getStats } from '../lib/api.js';

export const options = {
  stages: stages.smoke,
  thresholds: {
    ...defaultOptions.thresholds,
    // Smoke test ควรผ่านทุก request
    http_req_failed: ['rate<0.001'],
    http_req_duration: ['p(95)<300'],
  },
};

export default function () {
  // 1. Health Check
  const health = healthCheck();
  if (!health.success) {
    console.error('Health check failed!');
  }
  
  sleep(0.5);
  
  // 2. Get Products
  const products = getProducts();
  if (!products.success) {
    console.error('Get products failed!');
  }
  
  sleep(0.5);
  
  // 3. Get Categories
  const categories = getCategories();
  if (!categories.success) {
    console.error('Get categories failed!');
  }
  
  sleep(0.5);
  
  // 4. Get Stats
  const stats = getStats();
  if (!stats.success) {
    console.error('Get stats failed!');
  }
  
  sleep(1);
}

export function handleSummary(data) {
  console.log('\n========== SMOKE TEST SUMMARY ==========');
  console.log(`Total Requests: ${data.metrics.http_reqs?.values?.count || 0}`);
  console.log(`Failed Requests: ${data.metrics.http_req_failed?.values?.rate * 100 || 0}%`);
  console.log(`Avg Response Time: ${data.metrics.http_req_duration?.values?.avg?.toFixed(2) || 0}ms`);
  console.log(`p95 Response Time: ${data.metrics.http_req_duration?.values?.['p(95)']?.toFixed(2) || 0}ms`);
  console.log('=========================================\n');
  
  return {};
}
