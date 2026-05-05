import { EventStatus } from '../enums/event-status.enum';
import { mergeOverlappingEvents, MergeGroup, MergeInput } from './merge';

const ev = (
  id: string,
  start: string,
  end: string,
  overrides: Partial<MergeInput> = {},
): MergeInput => ({
  id,
  title: id,
  description: null,
  status: EventStatus.TODO,
  startTime: new Date(start),
  endTime: new Date(end),
  invitees: [],
  ...overrides,
});

describe('mergeOverlappingEvents', () => {
  describe('shape', () => {
    it('returns [] for an empty input', () => {
      expect(mergeOverlappingEvents([])).toEqual([]);
    });

    it('returns a single singleton group for one event', () => {
      const e = ev('A', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z');
      const result = mergeOverlappingEvents([e]);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject<Partial<MergeGroup>>({
        sourceIds: ['A'],
        title: 'A',
        startTime: e.startTime,
        endTime: e.endTime,
      });
    });
  });

  describe('overlap classification', () => {
    interface Case {
      name: string;
      input: MergeInput[];
      expectGroups: number;
      expectMergedSource?: string[];
      expectStart?: string;
      expectEnd?: string;
    }

    const cases: Case[] = [
      {
        name: 'two non-overlapping events stay separate',
        input: [
          ev('A', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z'),
          ev('B', '2026-01-01T12:00:00Z', '2026-01-01T13:00:00Z'),
        ],
        expectGroups: 2,
      },
      {
        name: 'touching intervals are NOT merged (strict overlap)',
        input: [
          ev('A', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z'),
          ev('B', '2026-01-01T11:00:00Z', '2026-01-01T12:00:00Z'),
        ],
        expectGroups: 2,
      },
      {
        name: 'strictly overlapping events merge (assignment example)',
        input: [
          ev('A', '2026-01-01T14:00:00Z', '2026-01-01T15:00:00Z'),
          ev('B', '2026-01-01T14:45:00Z', '2026-01-01T16:00:00Z'),
        ],
        expectGroups: 1,
        expectMergedSource: ['A', 'B'],
        expectStart: '2026-01-01T14:00:00Z',
        expectEnd: '2026-01-01T16:00:00Z',
      },
      {
        name: 'fully nested events merge with the outer endTime preserved',
        input: [
          ev('A', '2026-01-01T10:00:00Z', '2026-01-01T13:00:00Z'),
          ev('B', '2026-01-01T11:00:00Z', '2026-01-01T12:00:00Z'),
        ],
        expectGroups: 1,
        expectMergedSource: ['A', 'B'],
        expectStart: '2026-01-01T10:00:00Z',
        expectEnd: '2026-01-01T13:00:00Z',
      },
      {
        name: 'chained overlap (A↔B, B↔C, A∦C) folds all three together',
        input: [
          ev('A', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z'),
          ev('B', '2026-01-01T10:30:00Z', '2026-01-01T12:00:00Z'),
          ev('C', '2026-01-01T11:30:00Z', '2026-01-01T13:00:00Z'),
        ],
        expectGroups: 1,
        expectMergedSource: ['A', 'B', 'C'],
        expectStart: '2026-01-01T10:00:00Z',
        expectEnd: '2026-01-01T13:00:00Z',
      },
      {
        name: 'mix of merged and singleton groups returned in order',
        input: [
          ev('A', '2026-01-01T10:00:00Z', '2026-01-01T10:30:00Z'),
          ev('B', '2026-01-01T11:00:00Z', '2026-01-01T12:00:00Z'),
          ev('C', '2026-01-01T11:30:00Z', '2026-01-01T13:00:00Z'),
          ev('D', '2026-01-01T15:00:00Z', '2026-01-01T16:00:00Z'),
        ],
        expectGroups: 3,
      },
      {
        name: 'same startTime tiebreak still merges and picks max endTime',
        input: [
          ev('A', '2026-01-01T10:00:00Z', '2026-01-01T10:30:00Z'),
          ev('B', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z'),
        ],
        expectGroups: 1,
        expectMergedSource: ['A', 'B'],
        expectStart: '2026-01-01T10:00:00Z',
        expectEnd: '2026-01-01T11:00:00Z',
      },
    ];

    it.each(cases)('$name', (c) => {
      const result = mergeOverlappingEvents(c.input);
      expect(result).toHaveLength(c.expectGroups);

      if (c.expectMergedSource) {
        const merged = result.find((g) => g.sourceIds.length > 1);
        expect(merged).toBeDefined();
        expect(merged.sourceIds.sort()).toEqual(
          [...c.expectMergedSource].sort(),
        );
      }
      if (c.expectStart) {
        expect(result[0].startTime.toISOString()).toBe(
          new Date(c.expectStart).toISOString(),
        );
      }
      if (c.expectEnd) {
        expect(result[0].endTime.toISOString()).toBe(
          new Date(c.expectEnd).toISOString(),
        );
      }
    });
  });

  describe('idempotency', () => {
    it('running merge on its own output produces the same shape (no further merges)', () => {
      const input = [
        ev('A', '2026-01-01T14:00:00Z', '2026-01-01T15:00:00Z'),
        ev('B', '2026-01-01T14:45:00Z', '2026-01-01T16:00:00Z'),
        ev('C', '2026-01-01T17:00:00Z', '2026-01-01T18:00:00Z'),
      ];

      const first = mergeOverlappingEvents(input);
      const reLifted: MergeInput[] = first.map((g, idx) => ({
        id: `g${idx}`,
        title: g.title,
        description: g.description,
        status: g.status,
        startTime: g.startTime,
        endTime: g.endTime,
        invitees: g.inviteeIds.map((id) => ({ id })),
      }));
      const second = mergeOverlappingEvents(reLifted);

      expect(second).toHaveLength(first.length);
      first.forEach((g, i) => {
        expect(second[i].startTime.toISOString()).toBe(
          g.startTime.toISOString(),
        );
        expect(second[i].endTime.toISOString()).toBe(g.endTime.toISOString());
      });
    });
  });

  describe('field tie-breakers', () => {
    it('joins titles with " | " in startTime order', () => {
      const input = [
        ev('A', '2026-01-01T14:00:00Z', '2026-01-01T15:00:00Z', {
          title: 'Standup',
        }),
        ev('B', '2026-01-01T14:45:00Z', '2026-01-01T16:00:00Z', {
          title: 'Lunch',
        }),
      ];
      const [g] = mergeOverlappingEvents(input);
      expect(g.title).toBe('Standup | Lunch');
    });

    it('joins descriptions with " | " skipping nulls and empties', () => {
      const input = [
        ev('A', '2026-01-01T14:00:00Z', '2026-01-01T15:00:00Z', {
          description: 'design review',
        }),
        ev('B', '2026-01-01T14:30:00Z', '2026-01-01T15:30:00Z', {
          description: null,
        }),
        ev('C', '2026-01-01T15:15:00Z', '2026-01-01T16:00:00Z', {
          description: '',
        }),
        ev('D', '2026-01-01T15:45:00Z', '2026-01-01T16:30:00Z', {
          description: 'follow-up',
        }),
      ];
      const [g] = mergeOverlappingEvents(input);
      expect(g.description).toBe('design review | follow-up');
    });

    it('returns null description when no source had one', () => {
      const input = [
        ev('A', '2026-01-01T14:00:00Z', '2026-01-01T15:00:00Z'),
        ev('B', '2026-01-01T14:30:00Z', '2026-01-01T15:30:00Z'),
      ];
      const [g] = mergeOverlappingEvents(input);
      expect(g.description).toBeNull();
    });

    it.each<[EventStatus[], EventStatus]>([
      [[EventStatus.TODO, EventStatus.IN_PROGRESS], EventStatus.IN_PROGRESS],
      [[EventStatus.TODO, EventStatus.COMPLETED], EventStatus.TODO],
      [
        [EventStatus.IN_PROGRESS, EventStatus.COMPLETED],
        EventStatus.IN_PROGRESS,
      ],
      [
        [EventStatus.TODO, EventStatus.IN_PROGRESS, EventStatus.COMPLETED],
        EventStatus.IN_PROGRESS,
      ],
      [[EventStatus.COMPLETED, EventStatus.COMPLETED], EventStatus.COMPLETED],
    ])('status priority over %p picks %s', (statuses, expected) => {
      const input = statuses.map((status, i) =>
        ev(`E${i}`, `2026-01-01T1${i}:00:00Z`, `2026-01-01T1${i + 2}:00:00Z`, {
          status,
        }),
      );
      const [g] = mergeOverlappingEvents(input);
      expect(g.status).toBe(expected);
    });

    it('unions invitees by id across the merged set, preserving first-seen order', () => {
      const input = [
        ev('A', '2026-01-01T14:00:00Z', '2026-01-01T15:00:00Z', {
          invitees: [{ id: 'ada' }, { id: 'grace' }],
        }),
        ev('B', '2026-01-01T14:30:00Z', '2026-01-01T15:30:00Z', {
          invitees: [{ id: 'grace' }, { id: 'linus' }],
        }),
      ];
      const [g] = mergeOverlappingEvents(input);
      expect(g.inviteeIds).toEqual(['ada', 'grace', 'linus']);
    });

    it('singleton groups still dedupe their own invitees', () => {
      const input = [
        ev('A', '2026-01-01T14:00:00Z', '2026-01-01T15:00:00Z', {
          invitees: [{ id: 'ada' }, { id: 'ada' }, { id: 'grace' }],
        }),
      ];
      const [g] = mergeOverlappingEvents(input);
      expect(g.inviteeIds).toEqual(['ada', 'grace']);
    });
  });

  describe('input handling', () => {
    it('does not mutate the input array order', () => {
      const a = ev('A', '2026-01-01T15:00:00Z', '2026-01-01T16:00:00Z');
      const b = ev('B', '2026-01-01T14:00:00Z', '2026-01-01T15:00:00Z');
      const input = [a, b];
      const before = [...input];
      mergeOverlappingEvents(input);
      expect(input).toEqual(before);
    });
  });
});
