/**
 * K6 Products API Test
 * =====================
 * ทดสอบเฉพาะ Products API อย่างละเอียด
 * 
 * รัน: k6 run k6/endpoints/products.test.js
 */

import { sleep, group, check } from 'k6';
import http from 'k6/http';
import { Trend, Counter } from 'k6/metrics';
import { BASE_URL, endpoints, getHeaders, defaultOptions } from '../config.js';

// Custom metrics
const productListTime = new Trend('product_list_time');
const productDetailTime = new Trend('product_detail_time');
const productFilterTime = new Trend('product_filter_time');
const productSearchTime = new Trend('product_search_time');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    ...defaultOptions.thresholds,
    product_list_time: ['p(95)<400'],
    product_detail_time: ['p(95)<200'],
    product_filter_time: ['p(95)<500'],
  },
};

let categories = [];
let products = [];

export function setup() {
  // Get categories for testing
  const catResponse = http.get(`${BASE_URL}${endpoints.categories}`);
  try {
    categories = JSON.parse(catResponse.body) || [];
  } catch {}
  
  // Get products for detail testing
  const prodResponse = http.get(`${BASE_URL}${endpoints.products}`);
  try {
    const data = JSON.parse(prodResponse.body);
    products = data.products || data || [];
  } catch {}
  
  return { categories, products };
}

export default function (data) {
  // Test 1: Basic product list
  group('GET /api/products - List', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}${endpoints.products}`, {
      headers: getHeaders(),
    });
    productListTime.add(Date.now() - start);
    
    check(response, {
      'products list: status 200': (r) => r.status === 200,
      'products list: has products array': (r) => {
        try {
          const json = JSON.parse(r.body);
          return Array.isArray(json.products) || Array.isArray(json);
        } catch {
          return false;
        }
      },
    });
  });
  
  sleep(0.3);
  
  // Test 2: Product with limit
  group('GET /api/products?limit - Pagination', () => {
    const response = http.get(`${BASE_URL}${endpoints.products}?limit=10`, {
      headers: getHeaders(),
    });
    
    check(response, {
      'products limit: status 200': (r) => r.status === 200,
      'products limit: respects limit': (r) => {
        try {
          const json = JSON.parse(r.body);
          const list = json.products || json || [];
          return list.length <= 10;
        } catch {
          return false;
        }
      },
    });
  });
  
  sleep(0.3);
  
  // Test 3: Filter by category
  if (data.categories && data.categories.length > 0) {
    group('GET /api/products?category - Filter', () => {
      const randomCat = data.categories[Math.floor(Math.random() * data.categories.length)];
      const start = Date.now();
      const response = http.get(`${BASE_URL}${endpoints.products}?category=${randomCat.id}`, {
        headers: getHeaders(),
      });
      productFilterTime.add(Date.now() - start);
      
      check(response, {
        'products filter: status 200': (r) => r.status === 200,
      });
    });
  }
  
  sleep(0.3);
  
  // Test 4: Search
  group('GET /api/products?search - Search', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}${endpoints.products}?search=test`, {
      headers: getHeaders(),
    });
    productSearchTime.add(Date.now() - start);
    
    check(response, {
      'products search: status 200': (r) => r.status === 200,
    });
  });
  
  sleep(0.3);
  
  // Test 5: Single product detail
  if (data.products && data.products.length > 0) {
    group('GET /api/products/:id - Detail', () => {
      const randomProduct = data.products[Math.floor(Math.random() * data.products.length)];
      const start = Date.now();
      const response = http.get(`${BASE_URL}${endpoints.products}/${randomProduct.id}`, {
        headers: getHeaders(),
      });
      productDetailTime.add(Date.now() - start);
      
      check(response, {
        'product detail: status 200': (r) => r.status === 200,
        'product detail: has id': (r) => {
          try {
            const json = JSON.parse(r.body);
            return json.id !== undefined;
          } catch {
            return false;
          }
        },
      });
    });
  }
  
  sleep(0.5);
}

export function handleSummary(data) {
  console.log('\n========== PRODUCTS API TEST SUMMARY ==========');
  console.log('📦 Products Endpoint Analysis');
  console.log('');
  
  const metrics = [
    { name: 'Product List', key: 'product_list_time' },
    { name: 'Product Detail', key: 'product_detail_time' },
    { name: 'Product Filter', key: 'product_filter_time' },
    { name: 'Product Search', key: 'product_search_time' },
  ];
  
  metrics.forEach(m => {
    const metric = data.metrics[m.key];
    if (metric) {
      console.log(`${m.name}:`);
      console.log(`  Avg: ${(metric.values.avg || 0).toFixed(2)}ms`);
      console.log(`  p95: ${(metric.values['p(95)'] || 0).toFixed(2)}ms`);
    }
  });
  
  console.log('================================================\n');
  
  return {};
}
