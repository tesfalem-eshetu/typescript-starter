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

  it('GET / returns the hello world payload', async () => {
    await request(ctx.httpServer).get('/').expect(200).expect('Hello World!');
  });
});
