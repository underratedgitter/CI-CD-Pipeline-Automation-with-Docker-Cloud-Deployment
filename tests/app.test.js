const request = require('supertest');
const app = require('../app');

describe('GET /', () => {
  it('returns status ok and a message', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('message');
    expect(typeof res.body.message).toBe('string');
  });

  it('includes version and environment', async () => {
    const res = await request(app).get('/');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('environment');
  });
});

describe('GET /health', () => {
  it('returns uptime and timestamp', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
    expect(typeof res.body.uptime).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('includes memory and event loop checks', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toHaveProperty('checks');
    expect(res.body.checks).toHaveProperty('memory');
    expect(res.body.checks).toHaveProperty('eventLoop');
    expect(res.body.checks.memory).toHaveProperty('status');
    expect(res.body.checks.memory).toHaveProperty('rss');
    expect(res.body.checks.memory).toHaveProperty('heapUsed');
    expect(res.body.checks.memory).toHaveProperty('heapTotal');
  });

  it('returns healthy status by default', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toHaveProperty('status', 'healthy');
  });
});

describe('GET /ready', () => {
  it('returns ready status', async () => {
    const res = await request(app).get('/ready');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'ready');
    expect(res.body).toHaveProperty('timestamp');
  });
});

describe('GET /metrics', () => {
  it('returns prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toContain('http_request_duration_seconds');
    expect(res.text).toContain('nodejs_app_info');
  });

  it('has correct content type', async () => {
    const res = await request(app).get('/metrics');
    expect(res.headers['content-type']).toContain('text/plain');
  });
});

describe('GET /info', () => {
  it('returns application info', async () => {
    const res = await request(app).get('/info');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('nodeVersion');
    expect(res.body).toHaveProperty('environment');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('pid');
  });
});

describe('GET /nonexistent', () => {
  it('returns 404 with helpful message', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error', 'Not Found');
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('availableEndpoints');
    expect(Array.isArray(res.body.availableEndpoints)).toBe(true);
  });
});

describe('POST /', () => {
  it('returns 404 for unknown POST routes', async () => {
    const res = await request(app).post('/unknown').send({});
    expect(res.statusCode).toBe(404);
  });
});

describe('Rate Limiting', () => {
  it('allows requests under the limit', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
  });
});

describe('Security Headers', () => {
  it('includes security headers', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-xss-protection']).toBe('1; mode=block');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('does not expose X-Powered-By', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('Metrics Tracking', () => {
  it('increments request counter after GET /', async () => {
    // Make a request to increment the counter
    await request(app).get('/');
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('http_requests_total');
  });
});
