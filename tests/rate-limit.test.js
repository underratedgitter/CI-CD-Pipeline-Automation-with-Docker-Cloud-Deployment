// Isolated from tests/app.test.js: Jest gives each test file its own module
// registry, so requiring app.js here starts a fresh in-memory rate limit store
// and a low RATE_LIMIT_MAX, letting us actually reach the 429 branch.
describe('Rate limiting — over the limit', () => {
  const ORIGINAL_MAX = process.env.RATE_LIMIT_MAX;

  beforeAll(() => {
    process.env.RATE_LIMIT_MAX = '3';
  });

  afterAll(() => {
    if (ORIGINAL_MAX === undefined) delete process.env.RATE_LIMIT_MAX;
    else process.env.RATE_LIMIT_MAX = ORIGINAL_MAX;
  });

  it('returns 429 once the window limit is exceeded', async () => {
    jest.resetModules();
    const request = require('supertest');
    const app = require('../app');

    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/api/status');
      expect(res.statusCode).toBe(200);
    }

    const limited = await request(app).get('/api/status');
    expect(limited.statusCode).toBe(429);
    expect(limited.body).toHaveProperty('error', 'Too Many Requests');
    expect(limited.body).toHaveProperty('retryAfter', 60);
    expect(limited.headers['retry-after']).toBe('60');
  });
});
