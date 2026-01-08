/**
 * K6 Health & Stats API Test
 * ===========================
 * ทดสอบเฉพาะ Health Check และ Stats API
 * 
 * รัน: k6 run k6/endpoints/health.test.js
 */

import { sleep, group, check } from 'k6';
import http from 'k6/http';
import { Trend, Rate } from 'k6/metrics';
import { BASE_URL, endpoints, getHeaders } from '../config.js';

// Custom metrics
const healthTime = new Trend('health_check_time');
const statsTime = new Trend('stats_time');
const categoriesTime = new Trend('categories_time');
const healthSuccess = new Rate('health_success');

export const options = {
  stages: [
    { duration: '20s', target: 10 },
    { duration: '40s', target: 30 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    // Health check ต้องเร็วมาก
    health_check_time: ['p(95)<100', 'avg<50'],
    stats_time: ['p(95)<300'],
    categories_time: ['p(95)<200'],
    health_success: ['rate>0.99'],
  },
};

export default function () {
  // Test 1: Health Check
  group('GET /api/health', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}${endpoints.health}`, {
      headers: getHeaders(),
    });
    healthTime.add(Date.now() - start);
    
    const success = check(response, {
      'health: status 200': (r) => r.status === 200,
      'health: quick response': (r) => r.timings.duration < 100,
      'health: has status': (r) => {
        try {
          const json = JSON.parse(r.body);
          return json.status === 'ok' || json.status === 'healthy';
        } catch {
          return r.status === 200;
        }
      },
    });
    healthSuccess.add(success);
  });
  
  sleep(0.2);
  
  // Test 2: Stats
  group('GET /api/stats', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}${endpoints.stats}`, {
      headers: getHeaders(),
    });
    statsTime.add(Date.now() - start);
    
    check(response, {
      'stats: status 200': (r) => r.status === 200,
      'stats: has data': (r) => {
        try {
          const json = JSON.parse(r.body);
          return json !== null && typeof json === 'object';
        } catch {
          return false;
        }
      },
    });
  });
  
  sleep(0.2);
  
  // Test 3: Categories
  group('GET /api/categories', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}${endpoints.categories}`, {
      headers: getHeaders(),
    });
    categoriesTime.add(Date.now() - start);
    
    check(response, {
      'categories: status 200': (r) => r.status === 200,
      'categories: is array': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body));
        } catch {
          return false;
        }
      },
    });
  });
  
  sleep(0.3);
}

export function handleSummary(data) {
  console.log('\n========== HEALTH & STATS API TEST SUMMARY ==========');
  console.log('💚 System Health Analysis');
  console.log('');
  
  const health = data.metrics.health_check_time;
  const stats = data.metrics.stats_time;
  const categories = data.metrics.categories_time;
  const healthRate = data.metrics.health_success;
  
  console.log('Health Check:');
  if (health) {
    console.log(`  Avg: ${(health.values.avg || 0).toFixed(2)}ms`);
    console.log(`  p95: ${(health.values['p(95)'] || 0).toFixed(2)}ms`);
  }
  
  console.log('Stats:');
  if (stats) {
    console.log(`  Avg: ${(stats.values.avg || 0).toFixed(2)}ms`);
    console.log(`  p95: ${(stats.values['p(95)'] || 0).toFixed(2)}ms`);
  }
  
  console.log('Categories:');
  if (categories) {
    console.log(`  Avg: ${(categories.values.avg || 0).toFixed(2)}ms`);
    console.log(`  p95: ${(categories.values['p(95)'] || 0).toFixed(2)}ms`);
  }
  
  console.log('');
  console.log(`Health Success Rate: ${((healthRate?.values?.rate || 0) * 100).toFixed(2)}%`);
  
  console.log('=====================================================\n');
  
  return {};
}
