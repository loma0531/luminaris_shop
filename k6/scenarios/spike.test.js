/**
 * K6 Spike Test
 * ==============
 * ทดสอบการรับมือกับโหลดที่เพิ่มขึ้นกะทันหัน
 * 
 * รัน: k6 run k6/scenarios/spike.test.js
 */

import { sleep, group } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { stages, generateSessionId } from '../config.js';
import { 
  healthCheck, 
  getProducts, 
  getCategories,
  getStats,
} from '../lib/api.js';

// Custom metrics
const spikeErrors = new Counter('spike_errors');
const spikeRecovery = new Rate('spike_recovery');

export const options = {
  stages: stages.spike,
  thresholds: {
    // Spike test - ยอมรับ error ขณะ spike แต่ต้อง recover
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.30'], // ยอมรับ error 30% ขณะ spike
  },
};

export function setup() {
  console.log('Setting up spike test...');
  console.log('🔥 This test simulates sudden traffic spikes!');
  return {};
}

export default function () {
  const iteration = __ITER;
  const vus = __VU;
  
  group('Spike Load - Products', () => {
    const result = getProducts();
    
    if (!result.success) {
      spikeErrors.add(1);
      spikeRecovery.add(false);
    } else {
      spikeRecovery.add(true);
    }
  });
  
  sleep(0.05);
  
  group('Spike Load - Categories', () => {
    const result = getCategories();
    
    if (!result.success) {
      spikeErrors.add(1);
    }
  });
  
  sleep(0.05);
  
  group('Spike Load - Health', () => {
    const result = healthCheck();
    
    if (!result.success) {
      console.error(`System unhealthy during spike at VU ${vus}`);
    }
  });
  
  // Minimal sleep during spike
  sleep(0.05);
}

export function handleSummary(data) {
  console.log('\n========== SPIKE TEST SUMMARY ==========');
  console.log('🔥 SPIKE TEST RESULTS');
  console.log('');
  
  const totalReqs = data.metrics.http_reqs?.values?.count || 0;
  const failedRate = ((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2);
  const avgDuration = (data.metrics.http_req_duration?.values?.avg || 0).toFixed(2);
  const p95Duration = (data.metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(2);
  
  console.log(`Total Requests: ${totalReqs}`);
  console.log(`Failed Rate: ${failedRate}%`);
  console.log(`Avg Response Time: ${avgDuration}ms`);
  console.log(`p95 Response Time: ${p95Duration}ms`);
  console.log('');
  
  // Spike recovery analysis
  const recoveryRate = data.metrics.spike_recovery?.values?.rate || 0;
  console.log(`Recovery Rate: ${(recoveryRate * 100).toFixed(2)}%`);
  
  if (recoveryRate > 0.8) {
    console.log('✅ System recovered well from spike');
  } else if (recoveryRate > 0.5) {
    console.log('⚠️  System partially recovered from spike');
  } else {
    console.log('❌ System failed to handle spike');
  }
  
  console.log('=========================================\n');
  
  return {};
}
