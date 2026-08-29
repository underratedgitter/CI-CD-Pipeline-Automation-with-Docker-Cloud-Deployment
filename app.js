'use strict';

const express = require('express');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ── Security Headers ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.removeHeader('X-Powered-By');
  next();
});

// ── Rate Limiting ────────────────────────────────────────────────────────────
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 100;

function rateLimit(req, res, next) {
  if (req.path === '/health' || req.path === '/metrics') return next();
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  if (!rateLimitStore.has(clientIP)) rateLimitStore.set(clientIP, []);
  const requests = rateLimitStore.get(clientIP).filter((t) => now - t < RATE_LIMIT_WINDOW);
  rateLimitStore.set(clientIP, requests);
  if (requests.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too Many Requests', retryAfter: 60 });
  }
  requests.push(now);
  next();
}

// Clean up every 5 min
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
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
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
appInfo.labels(process.env.npm_package_version || '1.1.0', process.version, NODE_ENV).set(1);

// ── Metrics Middleware ───────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
  if (req.path === '/metrics') return next();
  const route = req.path;
  const method = req.method;
  httpRequestsInProgress.labels(method, route).inc();
  const end = httpRequestDuration.startTimer({ method, route });
  res.on('finish', () => {
    const statusCode = String(res.statusCode);
    httpRequestsTotal.labels(method, route, statusCode).inc();
    end({ status_code: statusCode });
    httpRequestsInProgress.labels(method, route).dec();
    if (res.statusCode >= 400) httpErrorsTotal.labels(method, route, statusCode).inc();
  });
  next();
});

app.use(rateLimit);

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'hello Sir', version: '1.1.0', environment: NODE_ENV });
});

// Health check — always returns 200 so Render doesn't mark the service as unhealthy
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: {
      rss: process.memoryUsage().rss,
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
    },
  });
});

app.get('/ready', (_req, res) => {
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
    version: '1.1.0',
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
    availableEndpoints: ['GET /', 'GET /health', 'GET /ready', 'GET /metrics', 'GET /info'],
  });
});

// ── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${new Date().toISOString()} ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ── Start ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[${NODE_ENV}] Server running on port ${PORT}`);
  });
}

module.exports = app;
