import request from 'supertest';
import { EventStatus } from '../src/events/enums/event-status.enum';
import { createTestApp, E2ETestContext } from './helpers/test-app.factory';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const baseEvent = {
  title: 'Project kickoff',
  description: 'Quarterly planning',
  status: EventStatus.TODO,
  startTime: '2026-05-05T14:00:00.000Z',
  endTime: '2026-05-05T15:00:00.000Z',
};

async function createUser(ctx: E2ETestContext, name: string): Promise<string> {
  const res = await request(ctx.httpServer)
    .post('/users')
    .send({ name })
    .expect(201);
  return res.body.id as string;
}

describe('Events (e2e)', () => {
  let ctx: E2ETestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('POST /events', () => {
    it('creates an event without invitees and returns the canonical shape', async () => {
      const res = await request(ctx.httpServer)
        .post('/events')
        .send({ ...baseEvent, inviteeIds: [] })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.stringMatching(UUID_RE),
        title: baseEvent.title,
        description: baseEvent.description,
        status: baseEvent.status,
        startTime: baseEvent.startTime,
        endTime: baseEvent.endTime,
        invitees: [],
      });
      expect(typeof res.body.createdAt).toBe('string');
      expect(typeof res.body.updatedAt).toBe('string');
    });

    it('creates an event with invitees and returns them flattened', async () => {
      const ada = await createUser(ctx, 'Ada Lovelace');
      const grace = await createUser(ctx, 'Grace Hopper');

      const res = await request(ctx.httpServer)
        .post('/events')
        .send({ ...baseEvent, inviteeIds: [ada, grace] })
        .expect(201);

      expect(res.body.invitees).toHaveLength(2);
      const invitees = (
        res.body.invitees as { id: string; name: string }[]
      ).map((u) => u.name);
      expect(invitees.sort()).toEqual(['Ada Lovelace', 'Grace Hopper']);
    });

    it('returns 404 when an invitee id does not exist', async () => {
      const res = await request(ctx.httpServer)
        .post('/events')
        .send({
          ...baseEvent,
          inviteeIds: ['00000000-0000-4000-8000-000000000000'],
        })
        .expect(404);

      expect(res.body.message).toMatch(/Invitee user.*not found/);
    });

    it('rejects when endTime is not strictly after startTime', async () => {
      const res = await request(ctx.httpServer)
        .post('/events')
        .send({
          ...baseEvent,
          startTime: '2026-05-05T15:00:00.000Z',
          endTime: '2026-05-05T15:00:00.000Z',
        })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining(['endTime must be after startTime']),
      );
    });

    it('rejects when title is missing', async () => {
      const { title: _omit, ...withoutTitle } = baseEvent;
      const res = await request(ctx.httpServer)
        .post('/events')
        .send(withoutTitle)
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining(['title should not be empty']),
      );
    });

    it('rejects an invitee id that is not a uuid', async () => {
      const res = await request(ctx.httpServer)
        .post('/events')
        .send({ ...baseEvent, inviteeIds: ['not-a-uuid'] })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/each value in inviteeIds.*UUID/i),
        ]),
      );
    });

    it('rejects a status value that is not in the enum', async () => {
      const res = await request(ctx.httpServer)
        .post('/events')
        .send({ ...baseEvent, status: 'BOGUS' })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringMatching(/status/)]),
      );
    });
  });

  describe('GET /events/:id', () => {
    it('returns a previously created event', async () => {
      const created = await request(ctx.httpServer)
        .post('/events')
        .send(baseEvent)
        .expect(201);

      const fetched = await request(ctx.httpServer)
        .get(`/events/${created.body.id}`)
        .expect(200);

      expect(fetched.body.id).toBe(created.body.id);
      expect(fetched.body.title).toBe(baseEvent.title);
    });

    it('returns 404 when the event does not exist', async () => {
      await request(ctx.httpServer)
        .get('/events/00000000-0000-4000-8000-000000000000')
        .expect(404);
    });

    it('returns 400 when the id is not a valid UUID', async () => {
      await request(ctx.httpServer).get('/events/not-a-uuid').expect(400);
    });
  });

  describe('DELETE /events/:id', () => {
    it('returns 204 and the event is gone afterwards', async () => {
      const created = await request(ctx.httpServer)
        .post('/events')
        .send(baseEvent)
        .expect(201);

      await request(ctx.httpServer)
        .delete(`/events/${created.body.id}`)
        .expect(204);

      await request(ctx.httpServer)
        .get(`/events/${created.body.id}`)
        .expect(404);
    });

    it('removes M2M join rows so the deleted event no longer appears on a user', async () => {
      const ada = await createUser(ctx, 'Ada (delete-cascade test)');

      const created = await request(ctx.httpServer)
        .post('/events')
        .send({ ...baseEvent, inviteeIds: [ada] })
        .expect(201);

      const beforeDelete = await request(ctx.httpServer)
        .get(`/users/${ada}`)
        .expect(200);
      expect(beforeDelete.body.eventIds).toContain(created.body.id);

      await request(ctx.httpServer)
        .delete(`/events/${created.body.id}`)
        .expect(204);

      const afterDelete = await request(ctx.httpServer)
        .get(`/users/${ada}`)
        .expect(200);
      expect(afterDelete.body.eventIds).not.toContain(created.body.id);
    });

    it('returns 404 when deleting a non-existent event', async () => {
      await request(ctx.httpServer)
        .delete('/events/00000000-0000-4000-8000-000000000000')
        .expect(404);
    });
  });
});
