// Isolated from tests/app.test.js: NODE_ENV must be 'production' at require
// time (app.js reads it once into a module-level constant), so this needs its
// own fresh module registry rather than mutating the shared app instance.
describe('Security headers — production environment', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  beforeAll(() => {
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  it('adds Strict-Transport-Security when running in production', async () => {
    jest.resetModules();
    const request = require('supertest');
    const app = require('../app');

    const res = await request(app).get('/');
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  });
});
