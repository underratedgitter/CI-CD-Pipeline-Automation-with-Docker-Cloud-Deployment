'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const client = require('prom-client');
const pkg = require('./package.json');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const VERSION = pkg.version;
// The portfolio's Vite build. The Dockerfile builds it into this path; locally,
// run `npm run build` inside portfolio/ first.
const PORTFOLIO_DIR = process.env.PORTFOLIO_DIR || path.join(__dirname, 'portfolio', 'dist');

// Flipped by the shutdown handler. Kubernetes reads it through /ready, which is
// how the pod leaves the Service's endpoint list before it stops accepting work.
let shuttingDown = false;

// ── Request ID ───────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// ── Security Headers ─────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Request-Id', _req.id);
  if (NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.removeHeader('X-Powered-By');
  next();
});

// ── Rate Limiting ────────────────────────────────────────────────────────────
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);

function rateLimit(req, res, next) {
  if (req.path === '/health' || req.path === '/metrics' || req.path === '/ready') return next();
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  if (!rateLimitStore.has(clientIP)) rateLimitStore.set(clientIP, []);
  const requests = rateLimitStore.get(clientIP).filter((t) => now - t < RATE_LIMIT_WINDOW);
  rateLimitStore.set(clientIP, requests);
  if (requests.length >= RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too Many Requests', retryAfter: 60, requestId: req.id });
  }
  requests.push(now);
  next();
}

// Clean up every 5 min, unref so it doesn't keep the process alive
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitStore.entries()) {
    const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
    if (valid.length === 0) rateLimitStore.delete(ip);
    else rateLimitStore.set(ip, valid);
  }
}, 5 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  const allowedOrigins = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim());
  const origin = _req.headers.origin;
  const allowed = allowedOrigins.includes('*') ? '*' : allowedOrigins.includes(origin) ? origin : null;
  if (allowed) res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Prometheus ───────────────────────────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestsInProgress = new client.Gauge({
  name: 'http_requests_in_progress',
  help: 'Number of HTTP requests currently being processed',
  labelNames: ['method', 'route'],
  registers: [register],
});

const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors (4xx and 5xx)',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const appInfo = new client.Gauge({
  name: 'nodejs_app_info',
  help: 'Node.js application information',
  labelNames: ['version', 'node_version', 'environment'],
  registers: [register],
});
appInfo.labels(VERSION, process.version, NODE_ENV).set(1);

// ── Metrics Middleware ───────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// Label by known route, not raw path: every distinct URL (scanners probing
// /wp-login.php, /.env, random IDs) otherwise mints new time series without bound.
// Portfolio files (hashed JS/CSS, fonts, images) all share the 'static' label;
// which file was served is only known once express.static has handled it.
const KNOWN_ROUTES = new Set(['/', '/health', '/ready', '/info', '/api/status']);
const routeLabel = (path, servedStatic) =>
  KNOWN_ROUTES.has(path) ? path : servedStatic ? 'static' : 'unmatched';

app.use((req, res, next) => {
  if (req.path === '/metrics') return next();
  const inProgressRoute = routeLabel(req.path, false);
  const method = req.method;
  httpRequestsInProgress.labels(method, inProgressRoute).inc();
  const end = httpRequestDuration.startTimer({ method });
  res.on('finish', () => {
    const route = routeLabel(req.path, res.locals.servedStatic === true);
    const statusCode = String(res.statusCode);
    httpRequestsTotal.labels(method, route, statusCode).inc();
    end({ route, status_code: statusCode });
    httpRequestsInProgress.labels(method, inProgressRoute).dec();
    if (res.statusCode >= 400) httpErrorsTotal.labels(method, route, statusCode).inc();
  });
  next();
});

// ── Portfolio ────────────────────────────────────────────────────────────────
// Ahead of the rate limiter: one page view is a dozen requests (HTML, CSS, JS,
// fonts, images), so counting them would lock a visitor out after a few reloads.
if (fs.existsSync(path.join(PORTFOLIO_DIR, 'index.html'))) {
  app.use(
    express.static(PORTFOLIO_DIR, {
      index: 'index.html',
      setHeaders: (res, filePath) => {
        res.locals.servedStatic = true;
        // Vite content-hashes everything under assets/, so those never change
        // under the same name. index.html must be revalidated to pick up a deploy.
        const hashed = filePath.startsWith(path.join(PORTFOLIO_DIR, 'assets') + path.sep);
        res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    })
  );
} else if (require.main === module) {
  console.warn(`[WARN] No portfolio build at ${PORTFOLIO_DIR}; GET / will return 404.`);
}

app.use(rateLimit);

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/status', (_req, res) => {
  res.json({ status: 'ok', message: 'hello Sir', version: VERSION, environment: NODE_ENV });
});

app.get('/health', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'healthy',
    version: VERSION,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
    },
  });
});

app.get('/ready', (_req, res) => {
  // Distinct from /health on purpose. Liveness asks "is this process broken,
  // restart it"; readiness asks "should traffic come here". During a drain the
  // answer is no while the process is still perfectly healthy — returning 200
  // here makes the whole graceful shutdown path decorative, because the load
  // balancer keeps sending requests to a server that is closing its sockets.
  if (shuttingDown) {
    return res.status(503).json({ status: 'shutting_down', timestamp: new Date().toISOString() });
  }
  res.json({ status: 'ready', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

app.get('/info', (_req, res) => {
  res.json({
    name: 'CI/CD Pipeline Automation',
    version: VERSION,
    nodeVersion: process.version,
    environment: NODE_ENV,
    uptime: process.uptime(),
    pid: process.pid,
  });
});

// ── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    error: 'Not Found',
    requestId: _req.id,
    availableEndpoints: ['GET /', 'GET /api/status', 'GET /health', 'GET /ready', 'GET /metrics', 'GET /info'],
  });
});

// ── Error Handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${new Date().toISOString()} [${req.id}] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: 'Internal Server Error', requestId: req.id });
});

// ── Graceful Shutdown ────────────────────────────────────────────────────────
let server;

function shutdown(signal) {
  // First, before anything is closed: stop passing readiness so the endpoint is
  // withdrawn while this process can still serve the requests already in flight.
  shuttingDown = true;
  console.log(`\n[${signal}] Shutting down gracefully...`);
  clearInterval(cleanupInterval);
  if (server) {
    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });
    // Force close after 10s
    setTimeout(() => {
      console.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Start ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`[${NODE_ENV}] Server v${VERSION} running on port ${PORT}`);
  });
}

module.exports = app;

// For tests. Nothing in the running application should call this — the signal
// handler owns the flag.
module.exports.setShuttingDown = (value) => {
  shuttingDown = value;
};
