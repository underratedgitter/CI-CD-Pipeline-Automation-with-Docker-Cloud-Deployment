'use strict';

const express = require('express');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Prometheus setup ──────────────────────────────────────────────────────────
// Collect default Node.js runtime metrics (CPU, memory, GC, event loop, etc.)
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

// Custom metric: app info (static label gauge, always = 1)
const appInfo = new client.Gauge({
  name: 'nodejs_app_info',
  help: 'Node.js application information',
  labelNames: ['version', 'node_version'],
  registers: [register],
});
appInfo.labels(process.env.npm_package_version || '1.0.0', process.version).set(1);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

// Metrics middleware — wraps every request
app.use((req, res, next) => {
  // Skip recording metrics for the /metrics endpoint itself
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
  });

  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

// GET / — Hello World
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'hello Sir' });
});

// GET /health — uptime & timestamp
app.get('/health', (req, res) => {
  res.json({
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
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

// ── Start server ──────────────────────────────────────────────────────────────
// Start server only when not required by tests
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Metrics available at http://localhost:${PORT}/metrics`);
  });
}

module.exports = app;
