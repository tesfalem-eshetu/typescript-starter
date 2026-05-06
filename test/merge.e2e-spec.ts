import request from 'supertest';
import { EventStatus } from '../src/events/enums/event-status.enum';
import { createTestApp, E2ETestContext } from './helpers/test-app.factory';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface InviteeBody {
  id: string;
  name: string;
}

interface EventBody {
  id: string;
  title: string;
  description: string | null;
  status: EventStatus;
  startTime: string;
  endTime: string;
  invitees: InviteeBody[];
  createdAt: string;
  updatedAt: string;
}

async function createUser(ctx: E2ETestContext, name: string): Promise<string> {
  const res = await request(ctx.httpServer)
    .post('/users')
    .send({ name })
    .expect(201);
  return (res.body as { id: string }).id;
}

interface CreateEventInput {
  title: string;
  description?: string | null;
  status?: EventStatus;
  startTime: string;
  endTime: string;
  inviteeIds?: string[];
}

async function createEvent(
  ctx: E2ETestContext,
  input: CreateEventInput,
): Promise<EventBody> {
  const res = await request(ctx.httpServer)
    .post('/events')
    .send({
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? EventStatus.TODO,
      startTime: input.startTime,
      endTime: input.endTime,
      inviteeIds: input.inviteeIds ?? [],
    })
    .expect(201);
  return res.body as EventBody;
}

async function mergeForUser(
  ctx: E2ETestContext,
  userId: string,
): Promise<EventBody[]> {
  const res = await request(ctx.httpServer)
    .post(`/users/${userId}/events/merge`)
    .expect(200);
  return res.body as EventBody[];
}

async function fetchEvent(
  ctx: E2ETestContext,
  id: string,
  status: number,
): Promise<EventBody | null> {
  const res = await request(ctx.httpServer).get(`/events/${id}`).expect(status);
  return status === 200 ? (res.body as EventBody) : null;
}

describe('Merge events (e2e)', () => {
  let ctx: E2ETestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('POST /users/:userId/events/merge', () => {
    it('returns 404 when the user does not exist', async () => {
      await request(ctx.httpServer)
        .post('/users/00000000-0000-4000-8000-000000000000/events/merge')
        .expect(404);
    });

    it('returns 400 when the userId is not a uuid', async () => {
      await request(ctx.httpServer)
        .post('/users/not-a-uuid/events/merge')
        .expect(400);
    });

    it('returns an empty list when the user has no events', async () => {
      const userId = await createUser(ctx, 'Empty calendar');
      const result = await mergeForUser(ctx, userId);
      expect(result).toEqual([]);
    });

    it('returns events unchanged and writes nothing when no overlaps exist', async () => {
      const userId = await createUser(ctx, 'Disjoint calendar');
      const a = await createEvent(ctx, {
        title: 'A',
        startTime: '2026-06-01T09:00:00.000Z',
        endTime: '2026-06-01T10:00:00.000Z',
        inviteeIds: [userId],
      });
      const b = await createEvent(ctx, {
        title: 'B',
        startTime: '2026-06-01T11:00:00.000Z',
        endTime: '2026-06-01T12:00:00.000Z',
        inviteeIds: [userId],
      });

      const result = await mergeForUser(ctx, userId);

      const ids = result.map((e) => e.id).sort();
      expect(ids).toEqual([a.id, b.id].sort());
      // No DB write means createdAt is unchanged.
      const reloaded = await fetchEvent(ctx, a.id, 200);
      expect(reloaded?.createdAt).toBe(a.createdAt);
    });

    it('does NOT merge events that only touch at the boundary', async () => {
      const userId = await createUser(ctx, 'Back-to-back calendar');
      await createEvent(ctx, {
        title: 'A',
        startTime: '2026-06-02T14:00:00.000Z',
        endTime: '2026-06-02T15:00:00.000Z',
        inviteeIds: [userId],
      });
      await createEvent(ctx, {
        title: 'B',
        startTime: '2026-06-02T15:00:00.000Z',
        endTime: '2026-06-02T16:00:00.000Z',
        inviteeIds: [userId],
      });

      const result = await mergeForUser(ctx, userId);

      expect(result).toHaveLength(2);
      expect(result.map((e) => e.title).sort()).toEqual(['A', 'B']);
    });

    it('merges two overlapping events into one and deletes the source events', async () => {
      const owner = await createUser(ctx, 'Overlap owner');
      const guest = await createUser(ctx, 'Overlap guest');

      const a = await createEvent(ctx, {
        title: 'Planning',
        description: 'Roadmap notes',
        status: EventStatus.TODO,
        startTime: '2026-06-03T14:00:00.000Z',
        endTime: '2026-06-03T15:00:00.000Z',
        inviteeIds: [owner],
      });
      const b = await createEvent(ctx, {
        title: 'Review',
        description: 'Design feedback',
        status: EventStatus.IN_PROGRESS,
        startTime: '2026-06-03T14:45:00.000Z',
        endTime: '2026-06-03T16:00:00.000Z',
        inviteeIds: [owner, guest],
      });

      const result = await mergeForUser(ctx, owner);

      expect(result).toHaveLength(1);
      const merged = result[0];
      expect(merged.id).toMatch(UUID_RE);
      expect(merged.id).not.toBe(a.id);
      expect(merged.id).not.toBe(b.id);
      expect(merged.title).toBe('Planning | Review');
      expect(merged.description).toBe('Roadmap notes | Design feedback');
      // IN_PROGRESS wins over TODO per status-priority rule.
      expect(merged.status).toBe(EventStatus.IN_PROGRESS);
      expect(merged.startTime).toBe('2026-06-03T14:00:00.000Z');
      expect(merged.endTime).toBe('2026-06-03T16:00:00.000Z');
      const inviteeIds = merged.invitees.map((u) => u.id).sort();
      expect(inviteeIds).toEqual([owner, guest].sort());

      // Source events are gone from the DB.
      await fetchEvent(ctx, a.id, 404);
      await fetchEvent(ctx, b.id, 404);
      await fetchEvent(ctx, merged.id, 200);
    });

    it('collapses a chain of three overlapping events into a single merged event', async () => {
      const userId = await createUser(ctx, 'Chained calendar');
      const a = await createEvent(ctx, {
        title: 'A',
        startTime: '2026-06-04T10:00:00.000Z',
        endTime: '2026-06-04T11:00:00.000Z',
        inviteeIds: [userId],
      });
      const b = await createEvent(ctx, {
        title: 'B',
        startTime: '2026-06-04T10:30:00.000Z',
        endTime: '2026-06-04T12:00:00.000Z',
        inviteeIds: [userId],
      });
      const c = await createEvent(ctx, {
        title: 'C',
        startTime: '2026-06-04T11:30:00.000Z',
        endTime: '2026-06-04T13:00:00.000Z',
        inviteeIds: [userId],
      });

      const result = await mergeForUser(ctx, userId);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('A | B | C');
      expect(result[0].startTime).toBe('2026-06-04T10:00:00.000Z');
      expect(result[0].endTime).toBe('2026-06-04T13:00:00.000Z');
      await fetchEvent(ctx, a.id, 404);
      await fetchEvent(ctx, b.id, 404);
      await fetchEvent(ctx, c.id, 404);
    });

    it('keeps disjoint overlap clusters separate', async () => {
      const userId = await createUser(ctx, 'Two-cluster calendar');
      await createEvent(ctx, {
        title: 'A1',
        startTime: '2026-06-05T09:00:00.000Z',
        endTime: '2026-06-05T10:00:00.000Z',
        inviteeIds: [userId],
      });
      await createEvent(ctx, {
        title: 'A2',
        startTime: '2026-06-05T09:30:00.000Z',
        endTime: '2026-06-05T10:30:00.000Z',
        inviteeIds: [userId],
      });
      await createEvent(ctx, {
        title: 'B1',
        startTime: '2026-06-05T14:00:00.000Z',
        endTime: '2026-06-05T15:00:00.000Z',
        inviteeIds: [userId],
      });
      await createEvent(ctx, {
        title: 'B2',
        startTime: '2026-06-05T14:30:00.000Z',
        endTime: '2026-06-05T16:00:00.000Z',
        inviteeIds: [userId],
      });

      const result = await mergeForUser(ctx, userId);

      expect(result).toHaveLength(2);
      const titles = result.map((e) => e.title).sort();
      expect(titles).toEqual(['A1 | A2', 'B1 | B2']);
    });

    it('does not touch events that belong only to other users', async () => {
      const ada = await createUser(ctx, 'Ada (scoped merge)');
      const grace = await createUser(ctx, 'Grace (scoped merge)');

      // Two overlapping events belonging only to Grace.
      const grace1 = await createEvent(ctx, {
        title: 'G1',
        startTime: '2026-06-06T09:00:00.000Z',
        endTime: '2026-06-06T10:00:00.000Z',
        inviteeIds: [grace],
      });
      const grace2 = await createEvent(ctx, {
        title: 'G2',
        startTime: '2026-06-06T09:30:00.000Z',
        endTime: '2026-06-06T11:00:00.000Z',
        inviteeIds: [grace],
      });

      // Merging Ada (no events) is a no-op for Grace's calendar.
      await mergeForUser(ctx, ada);

      await fetchEvent(ctx, grace1.id, 200);
      await fetchEvent(ctx, grace2.id, 200);
    });

    it('is idempotent: merging twice produces the same final state', async () => {
      const userId = await createUser(ctx, 'Idempotent calendar');
      await createEvent(ctx, {
        title: 'A',
        startTime: '2026-06-07T10:00:00.000Z',
        endTime: '2026-06-07T11:30:00.000Z',
        inviteeIds: [userId],
      });
      await createEvent(ctx, {
        title: 'B',
        startTime: '2026-06-07T11:00:00.000Z',
        endTime: '2026-06-07T12:00:00.000Z',
        inviteeIds: [userId],
      });

      const first = await mergeForUser(ctx, userId);
      expect(first).toHaveLength(1);
      const firstId = first[0].id;
      const firstCreatedAt = first[0].createdAt;

      const second = await mergeForUser(ctx, userId);
      expect(second).toHaveLength(1);
      // Same event row - no new merged event created on the second call.
      expect(second[0].id).toBe(firstId);
      expect(second[0].createdAt).toBe(firstCreatedAt);
    });
  });
});
