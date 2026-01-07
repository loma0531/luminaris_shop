
import { spawn } from "child_process";
import fs from "fs";

const BASE_URL = "http://localhost:3000";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

// Helpers
function log(type: "INFO" | "PASS" | "FAIL" | "WARN", msg: string) {
  const colors = {
    INFO: "\x1b[36m",
    PASS: GREEN,
    FAIL: RED,
    WARN: YELLOW,
  };
  console.log(`${colors[type]}[${type}]${RESET} ${msg}`);
}

async function req(method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  } catch (e: any) {
    return { status: 599, data: { error: e.message } };
  }
}

// Attack Payloads
const INJECTIONS = {
  SQLI: "' OR '1'='1",
  NOSQL: { "$ne": null },
  XSS: "<script>alert(1)</script>",
  HUGE_STRING: "A".repeat(10000),
  NEGATIVE_NUM: -100,
  ZERO: 0,
};

async function runAudit() {
  log("INFO", "Starting Security Audit on Localhose:3000...");
  
  // 1. SETUP: Create a valid User & Admin Token for testing logic gaps
  // We need to bypass or mock, or try public endpoints first.
  // Assuming 'admin' and 'user' exist or we try to login/create
  
  let adminToken = "";
  let userToken = "";
  let shopToken = ""; // For shop user
  
  // Try to define them manually or assume we need to fail if auth is working
  log("INFO", "--- PHASE 1: Authentication Vulnerabilities ---");
  
  // Test 1.1: Admin Login with Injection
  const adminLoginRes = await req("POST", "/api/admin/login", { 
    username: INJECTIONS.SQLI, 
    password: INJECTIONS.SQLI 
  });
  if (adminLoginRes.status === 401 || adminLoginRes.status === 400) {
    log("PASS", "Admin Login rejected Injection payload");
  } else {
    log("FAIL", `Admin Login Vulnerable? Status: ${adminLoginRes.status}`);
  }

  // Phase 2: Endpoint Enumeration & Access Control
  log("INFO", "--- PHASE 2: Access Control (Public vs Protected) ---");
  
  const PROTECTED_ENDPOINTS = [
    { method: "GET", path: "/api/admin/sales" },
    { method: "POST", path: "/api/upload" },
    { method: "POST", path: "/api/categories" },
    { method: "POST", path: "/api/products" },
    { method: "POST", path: "/api/rcon/retry" },
  ];

  for (const ep of PROTECTED_ENDPOINTS) {
    const res = await req(ep.method, ep.path, {});
    if (res.status === 401 || res.status === 403) {
      log("PASS", `${ep.method} ${ep.path} correctly blocked unauthenticated access`);
    } else {
      log("FAIL", `${ep.method} ${ep.path} allowed access without token! Status: ${res.status}`);
    }
  }

  // Phase 3: Input Validation & Injection (Using Checkout as main target)
  log("INFO", "--- PHASE 3: Input Validation & Business Logic ---");
  
  // 3.1 Checkout with Negative Price/Quantity
  const negOrder = {
    minecraftName: "Hacker",
    action: "create",
    total: -500,
    items: [{ productId: "507f1f77bcf86cd799439011", name: "HackItem", price: -10, quantity: -10 }]
  };
  const negRes = await req("POST", "/api/orders/checkout", negOrder);
  if (negRes.status === 400) {
    log("PASS", "Checkout rejected negative values");
  } else {
    log("FAIL", `Checkout accepted negative values! Status: ${negRes.status}`);
  }

  // 3.2: Checkout with Massive Quantity
  const hugeOrder = {
    minecraftName: "Hacker",
    action: "create",
    total: 100,
    items: [{ productId: "507f1f77bcf86cd799439011", name: "HackItem", price: 10, quantity: 9999999 }]
  };
  const hugeRes = await req("POST", "/api/orders/checkout", hugeOrder);
  if (hugeRes.status === 400) {
    log("PASS", "Checkout rejected huge quantity");
  } else {
    log("FAIL", `Checkout accepted huge quantity! Status: ${hugeRes.status}`);
  }

  // 3.3: RCON Verify Test Action (Should be locked now)
  const rconTestRes = await req("POST", "/api/rcon/verify", { action: "test" });
  if (rconTestRes.status === 401) {
    log("PASS", "RCON 'test' action correctly requires Admin Auth");
  } else {
    log("FAIL", `RCON 'test' action readable publicly! Status: ${rconTestRes.status}`);
  }

  // 3.4: RCON Execute Authorization
  // Try to execute without being that user
  const rconExecRes = await req("POST", "/api/rcon/execute", { 
    playerName: "Victim", 
    commands: ["give Victim diamond 1"],
    orderId: "507f1f77bcf86cd799439011" // Fake ID
  });
  // Should fail auth for "Victim" if we don't send headers, OR ensure we can't spoof
  if (rconExecRes.status === 401 || rconExecRes.status === 403) {
    log("PASS", "RCON Execute correctly requires User Auth");
  } else {
    log("FAIL", `RCON Execute allowed without checks! Status: ${rconExecRes.status}`);
  }

  // Phase 4: Data Exposure
  log("INFO", "--- PHASE 4: Data Exposure (Stats/Users) ---");
  
  const statsRes = await req("GET", "/api/stats");
  if (statsRes.status === 200) {
     const dataStr = JSON.stringify(statsRes.data);
     if (dataStr.includes("password") || dataStr.includes("email") || dataStr.includes("token")) {
        log("FAIL", "Stats API exposes sensitive keywords (password/email/token)");
     } else {
        log("PASS", "Stats API does not appear to leak sensitive keys");
     }
  }

  // Phase 5: XSS Checks
  log("INFO", "--- PHASE 5: XSS Payloads ---");
  const xssLogin = await req("POST", "/api/users", { minecraftName: INJECTIONS.XSS });
  // We expect either validation error (400) or sanitized output. 
  // Since we have regex validation on names:
  if (xssLogin.status === 400) {
    log("PASS", "User Creation rejected XSS payload in name");
  } else {
    log("WARN", `User Creation accepted XSS payload? Status: ${xssLogin.status} - Check if sanitized on output.`);
  }

  log("INFO", "Audit Complete.");
}

runAudit();
