/**
 * K6 Load Testing - Helpers
 * =========================
 * Utility functions สำหรับ k6 tests
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom Metrics
export const errorRate = new Rate('custom_error_rate');
export const successRate = new Rate('custom_success_rate');
export const responseTrend = new Trend('custom_response_time');
export const requestCounter = new Counter('custom_requests');

/**
 * Wrapper สำหรับ GET request พร้อม check
 */
export function httpGet(url, params = {}, expectedStatus = 200) {
  const response = http.get(url, params);
  
  const success = check(response, {
    [`status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'has response body': (r) => r.body && r.body.length > 0,
  });
  
  // Record custom metrics
  errorRate.add(!success);
  successRate.add(success);
  responseTrend.add(response.timings.duration);
  requestCounter.add(1);
  
  return { response, success };
}

/**
 * Wrapper สำหรับ POST request พร้อม check
 */
export function httpPost(url, body, params = {}, expectedStatus = 200) {
  const response = http.post(url, JSON.stringify(body), params);
  
  const success = check(response, {
    [`status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    'response time < 1000ms': (r) => r.timings.duration < 1000,
  });
  
  errorRate.add(!success);
  successRate.add(success);
  responseTrend.add(response.timings.duration);
  requestCounter.add(1);
  
  return { response, success };
}

/**
 * Random sleep between min and max seconds
 */
export function randomSleep(min = 0.5, max = 2) {
  sleep(Math.random() * (max - min) + min);
}

/**
 * Parse JSON response safely
 */
export function parseJson(response) {
  try {
    return JSON.parse(response.body);
  } catch (e) {
    return null;
  }
}

/**
 * Validate JSON response structure
 */
export function validateJsonResponse(response, requiredFields = []) {
  const data = parseJson(response);
  
  if (!data) {
    return { valid: false, data: null };
  }
  
  for (const field of requiredFields) {
    if (!(field in data)) {
      return { valid: false, data };
    }
  }
  
  return { valid: true, data };
}

/**
 * สร้าง random user data สำหรับ testing
 */
export function randomUser() {
  const id = Math.random().toString(36).substring(2, 10);
  return {
    username: `test_user_${id}`,
    email: `test_${id}@example.com`,
  };
}

/**
 * สร้าง random product selection
 */
export function randomProductSelection(products) {
  if (!products || products.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * products.length);
  return products[randomIndex];
}

/**
 * Group wrapper with timing
 */
export function timedGroup(name, fn) {
  const start = Date.now();
  let result;
  
  group(name, () => {
    result = fn();
  });
  
  const duration = Date.now() - start;
  console.log(`Group "${name}" completed in ${duration}ms`);
  
  return result;
}

/**
 * Batch requests
 */
export function batchRequests(requests, params = {}) {
  const responses = http.batch(requests);
  
  let allSuccess = true;
  responses.forEach((response, index) => {
    const success = check(response, {
      [`batch[${index}] status is 200`]: (r) => r.status === 200,
    });
    if (!success) allSuccess = false;
    errorRate.add(!success);
    successRate.add(success);
  });
  
  return { responses, allSuccess };
}
