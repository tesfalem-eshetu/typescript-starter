import request from 'supertest';
import { createTestApp, E2ETestContext } from './helpers/test-app.factory';

describe('AppController (e2e)', () => {
  let ctx: E2ETestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('GET / returns the HTML landing page that links to Swagger UI', async () => {
    const res = await request(ctx.httpServer)
      .get('/')
      .expect(200)
      .expect('Content-Type', /text\/html/);

    expect(res.text).toContain('<title>Events API</title>');
    expect(res.text).toContain('href="/api"');
  });
});
