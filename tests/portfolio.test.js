const path = require('path');

// Isolated from tests/app.test.js: PORTFOLIO_DIR is read once at require time,
// so this points it at a small fixture build in a fresh module registry.
describe('Portfolio static site', () => {
  const ORIGINAL_DIR = process.env.PORTFOLIO_DIR;
  const ORIGINAL_MAX = process.env.RATE_LIMIT_MAX;
  let request;
  let app;

  beforeAll(() => {
    process.env.PORTFOLIO_DIR = path.join(__dirname, 'fixtures', 'portfolio');
    process.env.RATE_LIMIT_MAX = '2';
    jest.resetModules();
    request = require('supertest');
    app = require('../app');
  });

  afterAll(() => {
    if (ORIGINAL_DIR === undefined) delete process.env.PORTFOLIO_DIR;
    else process.env.PORTFOLIO_DIR = ORIGINAL_DIR;
    if (ORIGINAL_MAX === undefined) delete process.env.RATE_LIMIT_MAX;
    else process.env.RATE_LIMIT_MAX = ORIGINAL_MAX;
  });

  it('serves index.html at / with revalidation and security headers', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Portfolio fixture');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('caches content-hashed assets as immutable', async () => {
    const res = await request(app).get('/assets/index-abc123.js');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('does not count page loads against the rate limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/robots.txt');
      expect(res.statusCode).toBe(200);
    }
  });

  it('labels portfolio files as static, and still 404s unknown paths as unmatched', async () => {
    await request(app).get('/assets/index-abc123.js');
    await request(app).get('/scanner-probe');
    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/http_requests_total\{method="GET",route="static",status_code="200"\}/);
    expect(res.text).toMatch(/http_requests_total\{method="GET",route="\/",status_code="200"\}/);
    expect(res.text).toMatch(/http_requests_total\{method="GET",route="unmatched",status_code="404"\}/);
    expect(res.text).not.toContain('index-abc123');
  });

  it('keeps the JSON status at /api/status', async () => {
    const res = await request(app).get('/api/status');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});
