const request = require('supertest');
const app = require('../app');

describe('GET /', () => {
  it('returns status ok and Hello World message', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok', message: 'Hello World' });
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
});
