'use strict';

const express = require('express');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ── Security Headers (manual, no extra deps) ─────────────────────────────────
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // HSTS (only in production)
  if (NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  // Remove X-Powered-By
  res.removeHeader('X-Powered-By');
  next();
});

// ── Rate Limiting (simple in-memory) ─────────────────────────────────────────
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // max requests per window

function rateLimit(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  if (!rateLimitStore.has(clientIP)) {
    rateLimitStore.set(clientIP, []);
  }

  const requests = rateLimitStore.get(clientIP).filter((t) => now - t < RATE_LIMIT_WINDOW);
  rateLimitStore.set(clientIP, requests);

  if (requests.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000),
    });
  }

  requests.push(now);
  next();
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitStore.entries()) {
    const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
    if (valid.length === 0) {
      rateLimitStore.delete(ip);
    } else {
      rateLimitStore.set(ip, valid);
    }
  }
}, 5 * 60 * 1000);

// ── CORS Configuration ───────────────────────────────────────────────────────
app.use((req, res, next) => {
  const allowedOrigins = (process.env.CORS_ORIGINS || '*').split(',');
  const origin = req.headers.origin;

  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes('*') ? '*' : origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// ── Prometheus setup ──────────────────────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Custom metric: total HTTP requests (counter)
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Custom metric: HTTP request duration histogram
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// Custom metric: in-progress requests (gauge)
const httpRequestsInProgress = new client.Gauge({
  name: 'http_requests_in_progress',
  help: 'Number of HTTP requests currently being processed',
  labelNames: ['method', 'route'],
  registers: [register],
});

// Custom metric: app info (static label gauge)
const appInfo = new client.Gauge({
  name: 'nodejs_app_info',
  help: 'Node.js application information',
  labelNames: ['version', 'node_version', 'environment'],
  registers: [register],
});
appInfo
  .labels(process.env.npm_package_version || '1.0.0', process.version, NODE_ENV)
  .set(1);

// Custom metric: errors counter
const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors (4xx and 5xx)',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' })); // Limit body size

// Metrics middleware — wraps every request
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

    // Track errors separately
    if (res.statusCode >= 400) {
      httpErrorsTotal.labels(method, route, statusCode).inc();
    }
  });

  next();
});

// Apply rate limit to API routes (skip /metrics and /health)
app.use(rateLimit);

// ── Routes ────────────────────────────────────────────────────────────────────

// GET / — Hello World
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'hello Sir',
    version: process.env.npm_package_version || '1.0.0',
    environment: NODE_ENV,
  });
});

// GET /health — detailed health check
app.get('/health', (req, res) => {
  const healthcheck = {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {
      memory: {
        status: 'ok',
        rss: process.memoryUsage().rss,
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
      },
      eventLoop: {
        status: 'ok',
      },
    },
  };

  // Check memory usage
  const memoryUsage = process.memoryUsage();
  const heapUsedPercent = memoryUsage.heapUsed / memoryUsage.heapTotal;
  if (heapUsedPercent > 0.9) {
    healthcheck.checks.memory.status = 'warning';
    healthcheck.status = 'degraded';
  }

  const statusCode = healthcheck.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(healthcheck);
});

// GET /ready — readiness probe
app.get('/ready', (req, res) => {
  res.json({ status: 'ready', timestamp: new Date().toISOString() });
});

// GET /metrics — Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// GET /info — application info
app.get('/info', (req, res) => {
  res.json({
    name: 'CI/CD Pipeline Automation',
    version: process.env.npm_package_version || '1.0.0',
    nodeVersion: process.version,
    environment: NODE_ENV,
    uptime: process.uptime(),
    pid: process.pid,
  });
});

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    availableEndpoints: ['GET /', 'GET /health', 'GET /ready', 'GET /metrics', 'GET /info'],
  });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${new Date().toISOString()} ${req.method} ${req.path}:`, err.message);

  // Track error in metrics
  if (req.path !== '/metrics') {
    httpErrorsTotal.labels(req.method, req.path, '500').inc();
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
  });
});

// ── Start server ──────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[${NODE_ENV}] Server running on port ${PORT}`);
    console.log(`Metrics available at http://localhost:${PORT}/metrics`);
    console.log(`Health check at http://localhost:${PORT}/health`);
  });
}

module.exports = app;
