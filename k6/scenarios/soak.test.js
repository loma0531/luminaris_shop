/**
 * K6 Soak Test
 * ==============
 * ทดสอบความเสถียรในระยะยาว - หา memory leaks และ performance degradation
 * 
 * รัน: k6 run k6/scenarios/soak.test.js
 * 
 * ⚠️  หมายเหตุ: Test นี้ใช้เวลานาน (~35 นาที)
 */

import { sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { stages, generateSessionId } from '../config.js';
import { 
  healthCheck, 
  getProducts, 
  getCategories,
  getStats,
  initShop,
  getCart,
  addToCart,
} from '../lib/api.js';
import { randomSleep } from '../lib/helpers.js';

// Custom metrics for soak analysis
const responseTimeOverTime = new Trend('response_time_over_time');
const healthOverTime = new Rate('health_over_time');
const memoryIssues = new Counter('memory_issues');

export const options = {
  stages: stages.soak,
  thresholds: {
    // Soak test - ต้องเสถียรตลอด
    http_req_duration: ['p(95)<1000', 'avg<500'],
    http_req_failed: ['rate<0.05'],
    // Custom threshold for health
    health_over_time: ['rate>0.95'],
  },
};

export function setup() {
  console.log('Setting up soak test...');
  console.log('⏱️  This test runs for ~35 minutes to check system stability');
  console.log('Looking for: memory leaks, performance degradation, connection issues');
  
  const products = getProducts({ limit: 50 });
  return {
    products: products.products || [],
    startTime: Date.now(),
  };
}

export default function (data) {
  const sessionId = generateSessionId();
  const elapsedMinutes = Math.floor((Date.now() - data.startTime) / 60000);
  
  // Regular browsing simulation
  group('Browse Products', () => {
    const start = Date.now();
    const result = getProducts();
    const duration = Date.now() - start;
    
    responseTimeOverTime.add(duration, { minute: elapsedMinutes });
    
    if (duration > 1000) {
      console.warn(`Slow response at minute ${elapsedMinutes}: ${duration}ms`);
    }
  });
  
  randomSleep(0.5, 1);
  
  group('Browse Categories', () => {
    getCategories();
  });
  
  randomSleep(0.3, 0.8);
  
  // Shopping flow
  group('Shopping Session', () => {
    initShop(sessionId);
    sleep(0.2);
    
    getCart(sessionId);
    sleep(0.2);
    
    if (data.products && data.products.length > 0) {
      const randomProduct = data.products[Math.floor(Math.random() * data.products.length)];
      if (randomProduct && randomProduct.id) {
        addToCart(sessionId, randomProduct.id, 1);
      }
    }
    
    getCart(sessionId);
  });
  
  randomSleep(0.5, 1);
  
  // Periodic health check
  group('Health Monitor', () => {
    const health = healthCheck();
    healthOverTime.add(health.success);
    
    if (!health.success) {
      console.error(`Health check failed at minute ${elapsedMinutes}`);
      memoryIssues.add(1);
    }
  });
  
  randomSleep(1, 2);
  
  // Stats check every few iterations
  if (__ITER % 10 === 0) {
    group('Stats Check', () => {
      getStats();
    });
  }
  
  randomSleep(1, 3);
}

export function teardown(data) {
  const totalMinutes = Math.floor((Date.now() - data.startTime) / 60000);
  console.log(`Soak test completed after ${totalMinutes} minutes`);
}

export function handleSummary(data) {
  console.log('\n========== SOAK TEST SUMMARY ==========');
  console.log('⏱️  SOAK TEST RESULTS (Long Duration)');
  console.log('');
  
  const totalReqs = data.metrics.http_reqs?.values?.count || 0;
  const failedRate = ((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2);
  const avgDuration = (data.metrics.http_req_duration?.values?.avg || 0).toFixed(2);
  const p95Duration = (data.metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(2);
  const minDuration = (data.metrics.http_req_duration?.values?.min || 0).toFixed(2);
  const maxDuration = (data.metrics.http_req_duration?.values?.max || 0).toFixed(2);
  const healthRate = ((data.metrics.health_over_time?.values?.rate || 0) * 100).toFixed(2);
  
  console.log(`Total Requests: ${totalReqs}`);
  console.log(`Failed Rate: ${failedRate}%`);
  console.log(`Health Rate: ${healthRate}%`);
  console.log('');
  console.log('Response Time Analysis:');
  console.log(`  Min: ${minDuration}ms`);
  console.log(`  Avg: ${avgDuration}ms`);
  console.log(`  p95: ${p95Duration}ms`);
  console.log(`  Max: ${maxDuration}ms`);
  console.log('');
  
  // Stability analysis
  const variance = parseFloat(maxDuration) - parseFloat(minDuration);
  const degradation = variance > 2000;
  
  if (parseFloat(healthRate) < 95) {
    console.log('❌ UNSTABLE - System health degraded over time');
    console.log('   Possible causes: memory leaks, connection pool exhaustion');
  } else if (degradation) {
    console.log('⚠️  DEGRADATION DETECTED - Response times increased over time');
    console.log('   Check for: memory leaks, garbage collection issues');
  } else if (parseFloat(failedRate) < 1) {
    console.log('✅ STABLE - System maintained consistent performance');
  } else {
    console.log('⚠️  MINOR ISSUES - Some errors but overall stable');
  }
  
  console.log('=========================================\n');
  
  return {};
}
