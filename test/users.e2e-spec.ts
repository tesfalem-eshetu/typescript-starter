import request from 'supertest';
import { createTestApp, E2ETestContext } from './helpers/test-app.factory';

describe('Users (e2e)', () => {
  let ctx: E2ETestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('POST /users', () => {
    it('creates a user and returns the canonical UserResponseDto shape', async () => {
      const response = await request(ctx.httpServer)
        .post('/users')
        .send({ name: 'Ada Lovelace' })
        .expect(201);

      expect(response.body).toEqual({
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        ),
        name: 'Ada Lovelace',
        eventIds: [],
      });
    });

    it('rejects an empty name with 400', async () => {
      const response = await request(ctx.httpServer)
        .post('/users')
        .send({ name: '' })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        path: '/users',
      });
      expect(response.body.message).toEqual(
        expect.arrayContaining(['name should not be empty']),
      );
    });

    it('rejects unknown properties with 400 (whitelist enforcement)', async () => {
      const response = await request(ctx.httpServer)
        .post('/users')
        .send({ name: 'Grace Hopper', admin: true })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining(['property admin should not exist']),
      );
    });
  });

  describe('GET /users/:id', () => {
    it('round-trips a created user', async () => {
      const created = await request(ctx.httpServer)
        .post('/users')
        .send({ name: 'Grace Hopper' })
        .expect(201);

      const fetched = await request(ctx.httpServer)
        .get(`/users/${created.body.id}`)
        .expect(200);

      expect(fetched.body).toEqual({
        id: created.body.id,
        name: 'Grace Hopper',
        eventIds: [],
      });
    });

    it('returns 404 when the user does not exist', async () => {
      const response = await request(ctx.httpServer)
        .get('/users/00000000-0000-4000-8000-000000000000')
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        error: 'Not Found',
      });
    });

    it('returns 400 when the id is not a valid UUID', async () => {
      await request(ctx.httpServer).get('/users/not-a-uuid').expect(400);
    });
  });
});
