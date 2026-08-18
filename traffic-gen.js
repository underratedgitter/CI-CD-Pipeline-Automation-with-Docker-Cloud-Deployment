#!/usr/bin/env node
'use strict';

/**
 * Traffic Generator — Quick Burst Mode
 * Sends high-concurrency requests to the deployed app for ~1-2 mins,
 * hitting all endpoints to populate Prometheus / Grafana dashboards.
 */

const https = require('https');
const http  = require('http');

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL    = process.env.TARGET_URL || 'https://ci-cd-pipeline-automation-app.onrender.com';
const DURATION_MS = Number(process.env.DURATION_MS) || 90_000;   // 1.5 min burst
const CONCURRENCY = Number(process.env.CONCURRENCY) || 20;        // parallel workers
const DELAY_MS    = Number(process.env.DELAY_MS)    || 50;        // ms between each worker's requests

// Endpoints to hit — mix of 200s and intentional 404s for realistic metric variety
const ROUTES = [
  { path: '/',       weight: 40 },
  { path: '/health', weight: 35 },
  { path: '/metrics',weight: 15 },
  { path: '/notfound', weight: 10 },  // intentional 404 for error metrics
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function pickRoute() {
  const total = ROUTES.reduce((s, r) => s + r.weight, 0);
  let rand = Math.random() * total;
  for (const route of ROUTES) {
    rand -= route.weight;
    if (rand <= 0) return route.path;
  }
  return '/';
}

function fetch(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const start = Date.now();
    const req = mod.get(url, { timeout: 8000 }, (res) => {
      res.resume(); // drain response
      res.on('end', () => resolve({ status: res.statusCode, ms: Date.now() - start }));
    });
    req.on('error', () => resolve({ status: 0, ms: Date.now() - start }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 408, ms: Date.now() - start }); });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Stats ─────────────────────────────────────────────────────────────────────
const stats = { total: 0, ok: 0, err: 0, timeouts: 0, totalMs: 0 };
const statusBuckets = {};

function record({ status, ms }) {
  stats.total++;
  stats.totalMs += ms;
  if (status >= 200 && status < 400) stats.ok++;
  else if (status === 408)           stats.timeouts++;
  else                               stats.err++;
  statusBuckets[status] = (statusBuckets[status] || 0) + 1;
}

function printStats(elapsed) {
  const rps   = (stats.total / (elapsed / 1000)).toFixed(1);
  const avgMs = stats.total ? (stats.totalMs / stats.total).toFixed(0) : 0;
  const codes = Object.entries(statusBuckets)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join('  ');

  process.stdout.write(
    `\r\x1b[36m[${(elapsed/1000).toFixed(1)}s]\x1b[0m ` +
    `\x1b[32m✓${stats.ok}\x1b[0m ` +
    `\x1b[31m✗${stats.err}\x1b[0m ` +
    `⏱${stats.timeouts}  ` +
    `${rps} req/s  avg:${avgMs}ms  ` +
    `\x1b[90m${codes}\x1b[0m       `
  );
}

// ── Worker ────────────────────────────────────────────────────────────────────
async function worker(id, endAt) {
  while (Date.now() < endAt) {
    const url = BASE_URL + pickRoute();
    const result = await fetch(url);
    record(result);
    await sleep(DELAY_MS + Math.random() * DELAY_MS); // jitter
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n\x1b[1m🚀 Traffic Generator — Quick Burst\x1b[0m`);
  console.log(`\x1b[90mTarget   : ${BASE_URL}`);
  console.log(`Duration : ${DURATION_MS / 1000}s`);
  console.log(`Workers  : ${CONCURRENCY}`);
  console.log(`\x1b[0m`);

  // Wake the Render instance first (cold starts are slow)
  console.log('🌡️  Warming up instance...');
  const warmup = await fetch(BASE_URL + '/health');
  console.log(`   /health → ${warmup.status} (${warmup.ms}ms)\n`);

  const startAt = Date.now();
  const endAt   = startAt + DURATION_MS;

  // Kick off all workers in parallel
  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i, endAt));

  // Live stats ticker
  const ticker = setInterval(() => printStats(Date.now() - startAt), 500);

  await Promise.all(workers);
  clearInterval(ticker);

  const elapsed = Date.now() - startAt;
  printStats(elapsed);
  console.log('\n');

  // Final summary
  console.log('\x1b[1m📊 Final Summary\x1b[0m');
  console.log(`  Total requests : \x1b[1m${stats.total}\x1b[0m`);
  console.log(`  Successful     : \x1b[32m${stats.ok}\x1b[0m`);
  console.log(`  Errors         : \x1b[31m${stats.err}\x1b[0m`);
  console.log(`  Timeouts       : ${stats.timeouts}`);
  console.log(`  Avg latency    : ${stats.total ? (stats.totalMs / stats.total).toFixed(0) : 0}ms`);
  console.log(`  Throughput     : ${(stats.total / (elapsed / 1000)).toFixed(1)} req/s`);
  console.log(`  Duration       : ${(elapsed / 1000).toFixed(1)}s`);
  console.log('\nStatus breakdown:');
  Object.entries(statusBuckets).sort((a, b) => b[1] - a[1]).forEach(([code, count]) => {
    const bar = '█'.repeat(Math.ceil(count / stats.total * 30));
    const pct = (count / stats.total * 100).toFixed(1);
    console.log(`  HTTP ${code}  ${bar} ${pct}% (${count})`);
  });
  console.log('\n\x1b[32m✅ Burst complete! Check your Grafana dashboard.\x1b[0m\n');
}

main().catch(console.error);
