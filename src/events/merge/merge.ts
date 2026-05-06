import { EventStatus } from '../enums/event-status.enum';

/**
 * Minimal shape the pure merge algorithm needs. Decoupled from the TypeORM
 * Event entity so the algorithm can be tested without any DB or Nest context.
 */
export interface MergeInput {
  id: string;
  title: string;
  description: string | null;
  status: EventStatus;
  startTime: Date;
  endTime: Date;
  invitees: ReadonlyArray<{ id: string }>;
}

/**
 * Output of the merge sweep. A group with `sourceIds.length === 1` is an
 * untouched singleton; a group with `sourceIds.length > 1` is a new merged
 * event whose source rows must be replaced in the database.
 */
export interface MergeGroup {
  sourceIds: string[];
  title: string;
  description: string | null;
  status: EventStatus;
  startTime: Date;
  endTime: Date;
  inviteeIds: string[];
}

const STATUS_PRIORITY: Readonly<Record<EventStatus, number>> = {
  [EventStatus.IN_PROGRESS]: 3,
  [EventStatus.TODO]: 2,
  [EventStatus.COMPLETED]: 1,
};

/**
 * Pure sweep-line merge of overlapping events.
 *
 * Two events overlap iff `next.startTime < current.endTime` (strict; touching
 * intervals like `[2-3]` and `[3-4]` are considered adjacent, not overlapping).
 * Chains are handled naturally: extending `current.endTime` to `max(current,
 * next)` after each merge means a transitively overlapping third event will
 * still be folded in.
 *
 * Tie-breakers when fields disagree across the merged set:
 * - `title`        : joined with ` | ` in startTime order
 * - `description`  : joined with ` | `, skipping nulls/empties; null if all empty
 * - `status`       : highest priority wins (IN_PROGRESS > TODO > COMPLETED)
 * - `startTime`    : earliest of the set
 * - `endTime`      : latest of the set
 * - `inviteeIds`   : set union by user id, preserving first-seen order
 */
export function mergeOverlappingEvents(
  events: ReadonlyArray<MergeInput>,
): MergeGroup[] {
  if (events.length === 0) {
    return [];
  }

  const sorted = [...events].sort((a, b) => {
    const startDiff = a.startTime.getTime() - b.startTime.getTime();
    if (startDiff !== 0) return startDiff;
    return a.endTime.getTime() - b.endTime.getTime();
  });

  const groups: MergeGroup[] = [];
  let current = startGroup(sorted[0]);

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (next.startTime.getTime() < current.endTime.getTime()) {
      mergeInto(current, next);
    } else {
      groups.push(finalize(current));
      current = startGroup(next);
    }
  }
  groups.push(finalize(current));

  return groups;
}

interface GroupBuilder {
  sourceIds: string[];
  titles: string[];
  descriptions: string[];
  statuses: EventStatus[];
  startTime: Date;
  endTime: Date;
  inviteeIds: string[];
  inviteeSeen: Set<string>;
}

function startGroup(e: MergeInput): GroupBuilder {
  const inviteeSeen = new Set<string>();
  const inviteeIds: string[] = [];
  for (const u of e.invitees) {
    if (!inviteeSeen.has(u.id)) {
      inviteeSeen.add(u.id);
      inviteeIds.push(u.id);
    }
  }
  return {
    sourceIds: [e.id],
    titles: [e.title],
    descriptions: e.description ? [e.description] : [],
    statuses: [e.status],
    startTime: e.startTime,
    endTime: e.endTime,
    inviteeIds,
    inviteeSeen,
  };
}

function mergeInto(g: GroupBuilder, e: MergeInput): void {
  g.sourceIds.push(e.id);
  g.titles.push(e.title);
  if (e.description && e.description.length > 0) {
    g.descriptions.push(e.description);
  }
  g.statuses.push(e.status);
  if (e.endTime.getTime() > g.endTime.getTime()) {
    g.endTime = e.endTime;
  }
  for (const u of e.invitees) {
    if (!g.inviteeSeen.has(u.id)) {
      g.inviteeSeen.add(u.id);
      g.inviteeIds.push(u.id);
    }
  }
}

function finalize(g: GroupBuilder): MergeGroup {
  return {
    sourceIds: g.sourceIds,
    title: g.titles.join(' | '),
    description: g.descriptions.length > 0 ? g.descriptions.join(' | ') : null,
    status: pickStatus(g.statuses),
    startTime: g.startTime,
    endTime: g.endTime,
    inviteeIds: g.inviteeIds,
  };
}

function pickStatus(statuses: EventStatus[]): EventStatus {
  return statuses.reduce((best, s) =>
    STATUS_PRIORITY[s] > STATUS_PRIORITY[best] ? s : best,
  );
}
