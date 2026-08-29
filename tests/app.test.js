const request = require('supertest');
const app = require('../app');

describe('GET /', () => {
  it('returns status ok and a message', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('message');
  });
});

describe('GET /health', () => {
  it('always returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'healthy');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('memory');
  });
});

describe('GET /ready', () => {
  it('returns ready status', async () => {
    const res = await request(app).get('/ready');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'ready');
  });
});

describe('GET /metrics', () => {
  it('returns prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('http_requests_total');
  });
});

describe('GET /info', () => {
  it('returns application info', async () => {
    const res = await request(app).get('/info');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('version');
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error', 'Not Found');
  });
});

describe('Security headers', () => {
  it('includes security headers', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
