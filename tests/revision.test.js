// Isolated from tests/app.test.js: the revision is read once at require time,
// so each case sets the environment and loads app.js in a fresh module registry.
describe('Revision source', () => {
  const ORIGINAL = { RENDER_GIT_COMMIT: process.env.RENDER_GIT_COMMIT, REVISION: process.env.REVISION };

  afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const loadInfo = async () => {
    jest.resetModules();
    const request = require('supertest');
    const app = require('../app');
    return (await request(app).get('/info')).body;
  };

  it("prefers Render's RENDER_GIT_COMMIT over the baked-in REVISION", async () => {
    process.env.RENDER_GIT_COMMIT = 'render-commit';
    process.env.REVISION = 'image-commit';
    expect((await loadInfo()).revision).toBe('render-commit');
  });

  it('falls back to REVISION from the image', async () => {
    delete process.env.RENDER_GIT_COMMIT;
    process.env.REVISION = 'image-commit';
    expect((await loadInfo()).revision).toBe('image-commit');
  });

  it("reports 'unknown' when neither is set", async () => {
    delete process.env.RENDER_GIT_COMMIT;
    delete process.env.REVISION;
    expect((await loadInfo()).revision).toBe('unknown');
  });
});
