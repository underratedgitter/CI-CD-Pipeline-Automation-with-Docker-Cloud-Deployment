const request = require('supertest');
const app = require('../app');

// ── GET / ────────────────────────────────────────────────────────────────────
describe('GET /', () => {
  it('returns status ok and a message', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('message');
  });

  it('returns version from package.json', async () => {
    const res = await request(app).get('/');
    expect(res.body.version).toBe(require('../package.json').version);
  });

  it('includes environment', async () => {
    const res = await request(app).get('/');
    expect(res.body).toHaveProperty('environment');
  });
});

// ── GET /health ──────────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('always returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'healthy');
  });

  it('includes memory stats', async () => {
    const res = await request(app).get('/health');
    expect(res.body.memory).toHaveProperty('rss');
    expect(res.body.memory).toHaveProperty('heapUsed');
    expect(res.body.memory).toHaveProperty('heapTotal');
    expect(res.body.memory).toHaveProperty('external');
  });

  it('includes version and uptime', async () => {
    const res = await request(app).get('/health');
    expect(res.body.version).toBe(require('../package.json').version);
    expect(typeof res.body.uptime).toBe('number');
  });
});

// ── GET /ready ───────────────────────────────────────────────────────────────
describe('GET /ready', () => {
  it('returns ready status', async () => {
    const res = await request(app).get('/ready');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'ready');
  });
});

// ── GET /metrics ─────────────────────────────────────────────────────────────
describe('GET /metrics', () => {
  it('returns prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toContain('http_request_duration_seconds');
    expect(res.text).toContain('nodejs_app_info');
  });
});

// ── GET /info ────────────────────────────────────────────────────────────────
describe('GET /info', () => {
  it('returns application info', async () => {
    const res = await request(app).get('/info');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('name', 'CI/CD Pipeline Automation');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('pid');
  });
});

// ── 404 Handler ──────────────────────────────────────────────────────────────
describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error', 'Not Found');
  });

  it('includes request ID in 404 response', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.body).toHaveProperty('requestId');
  });

  it('includes available endpoints', async () => {
    const res = await request(app).get('/nonexistent');
    expect(Array.isArray(res.body.availableEndpoints)).toBe(true);
    expect(res.body.availableEndpoints).toContain('GET /health');
  });
});

// ── Security Headers ─────────────────────────────────────────────────────────
describe('Security headers', () => {
  it('includes all security headers', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-xss-protection']).toBe('1; mode=block');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('includes request ID header', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('returns same request ID if provided', async () => {
    const customId = 'test-request-123';
    const res = await request(app).get('/').set('X-Request-Id', customId);
    expect(res.headers['x-request-id']).toBe(customId);
  });
});

// ── Rate Limiting ────────────────────────────────────────────────────────────
describe('Rate Limiting', () => {
  it('allows requests under the limit', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
  });

  it('skips rate limiting for /health', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
  });

  it('skips rate limiting for /metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.statusCode).toBe(200);
  });
});

// ── Metrics Tracking ─────────────────────────────────────────────────────────
describe('Metrics Tracking', () => {
  it('increments request counter', async () => {
    await request(app).get('/');
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('http_requests_total');
  });

  it('tracks response duration', async () => {
    await request(app).get('/');
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('http_request_duration_seconds');
  });
});
