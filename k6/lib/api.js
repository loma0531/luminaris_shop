/**
 * K6 Load Testing - API Helpers
 * =============================
 * Functions สำหรับ call API endpoints ต่างๆ
 */

import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, endpoints, getHeaders, generateSessionId } from '../config.js';

/**
 * Health Check
 */
export function healthCheck() {
  const response = http.get(`${BASE_URL}${endpoints.health}`);
  
  const success = check(response, {
    'health check: status 200': (r) => r.status === 200,
    'health check: response < 100ms': (r) => r.timings.duration < 100,
  });
  
  return { response, success };
}

/**
 * Get Products
 */
export function getProducts(params = {}) {
  let url = `${BASE_URL}${endpoints.products}`;
  
  // Add query params
  const queryParams = [];
  if (params.category) queryParams.push(`category=${params.category}`);
  if (params.search) queryParams.push(`search=${encodeURIComponent(params.search)}`);
  if (params.limit) queryParams.push(`limit=${params.limit}`);
  if (params.cursor) queryParams.push(`cursor=${params.cursor}`);
  
  if (queryParams.length > 0) {
    url += '?' + queryParams.join('&');
  }
  
  const response = http.get(url, { headers: getHeaders() });
  
  const success = check(response, {
    'get products: status 200': (r) => r.status === 200,
    'get products: has products': (r) => {
      try {
        const data = JSON.parse(r.body);
        return Array.isArray(data.products) || Array.isArray(data);
      } catch {
        return false;
      }
    },
  });
  
  let products = [];
  try {
    const data = JSON.parse(response.body);
    products = data.products || data || [];
  } catch {}
  
  return { response, success, products };
}

/**
 * Get Single Product
 */
export function getProduct(productId) {
  const response = http.get(`${BASE_URL}${endpoints.products}/${productId}`, {
    headers: getHeaders(),
  });
  
  const success = check(response, {
    'get product: status 200': (r) => r.status === 200,
  });
  
  return { response, success };
}

/**
 * Get Categories
 */
export function getCategories() {
  const response = http.get(`${BASE_URL}${endpoints.categories}`, {
    headers: getHeaders(),
  });
  
  const success = check(response, {
    'get categories: status 200': (r) => r.status === 200,
    'get categories: is array': (r) => {
      try {
        return Array.isArray(JSON.parse(r.body));
      } catch {
        return false;
      }
    },
  });
  
  let categories = [];
  try {
    categories = JSON.parse(response.body);
  } catch {}
  
  return { response, success, categories };
}

/**
 * Get Stats
 */
export function getStats() {
  const response = http.get(`${BASE_URL}${endpoints.stats}`, {
    headers: getHeaders(),
  });
  
  const success = check(response, {
    'get stats: status 200': (r) => r.status === 200,
  });
  
  return { response, success };
}

/**
 * Initialize Shop Session
 */
export function initShop(sessionId) {
  const response = http.get(`${BASE_URL}${endpoints.shopInit}`, {
    headers: getHeaders(sessionId),
  });
  
  const success = check(response, {
    'init shop: status 200': (r) => r.status === 200,
  });
  
  return { response, success };
}

/**
 * Get Cart
 */
export function getCart(sessionId) {
  const response = http.get(`${BASE_URL}${endpoints.cart}`, {
    headers: getHeaders(sessionId),
  });
  
  const success = check(response, {
    'get cart: status 200': (r) => r.status === 200,
  });
  
  let cart = null;
  try {
    cart = JSON.parse(response.body);
  } catch {}
  
  return { response, success, cart };
}

/**
 * Add to Cart
 */
export function addToCart(sessionId, productId, quantity = 1) {
  const response = http.post(
    `${BASE_URL}${endpoints.cart}`,
    JSON.stringify({
      productId,
      quantity,
    }),
    { headers: getHeaders(sessionId) }
  );
  
  const success = check(response, {
    'add to cart: status 200': (r) => r.status === 200,
  });
  
  return { response, success };
}

/**
 * Update Cart
 */
export function updateCart(sessionId, items) {
  const response = http.post(
    `${BASE_URL}${endpoints.cart}`,
    JSON.stringify({ items }),
    { headers: getHeaders(sessionId) }
  );
  
  const success = check(response, {
    'update cart: status 200': (r) => r.status === 200,
  });
  
  return { response, success };
}

/**
 * Get CSRF Token
 */
export function getCsrfToken(sessionId) {
  const response = http.get(`${BASE_URL}${endpoints.csrf}`, {
    headers: getHeaders(sessionId),
  });
  
  const success = check(response, {
    'get csrf: status 200': (r) => r.status === 200,
  });
  
  let token = null;
  try {
    const data = JSON.parse(response.body);
    token = data.csrfToken;
  } catch {}
  
  return { response, success, token };
}

/**
 * Get User Orders
 */
export function getUserOrders(sessionId) {
  const response = http.get(`${BASE_URL}${endpoints.ordersUser}`, {
    headers: getHeaders(sessionId),
  });
  
  const success = check(response, {
    'get user orders: status 200': (r) => r.status === 200,
  });
  
  return { response, success };
}

/**
 * Checkout (สำหรับ testing flow - ไม่ submit จริง)
 */
export function checkout(sessionId, csrfToken, username) {
  const response = http.post(
    `${BASE_URL}${endpoints.checkout}`,
    JSON.stringify({
      sessionId,
      csrfToken,
      username,
    }),
    { headers: getHeaders(sessionId) }
  );
  
  // ไม่ check status เพราะอาจ fail ได้ตามปกติ (empty cart, invalid token, etc.)
  return { response };
}

/**
 * Admin Login (สำหรับ admin tests)
 */
export function adminLogin(username, password) {
  const response = http.post(
    `${BASE_URL}${endpoints.adminLogin}`,
    JSON.stringify({ username, password }),
    { headers: getHeaders() }
  );
  
  let token = null;
  try {
    const data = JSON.parse(response.body);
    token = data.token;
  } catch {}
  
  return { response, token };
}
