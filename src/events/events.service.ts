import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { Event } from './entities/event.entity';
import { mergeOverlappingEvents, MergeInput } from './merge/merge';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateEventDto): Promise<Event> {
    const invitees = await this.resolveInvitees(dto.inviteeIds);

    const event = this.eventsRepository.create({
      title: dto.title,
      description: dto.description ?? null,
      status: dto.status,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      invitees,
    });

    const saved = await this.eventsRepository.save(event);
    // save() does not always re-load relations; re-read for a stable response.
    return this.findOne(saved.id);
  }

  async findOne(id: string): Promise<Event> {
    const event = await this.eventsRepository.findOne({
      where: { id },
      relations: { invitees: true },
    });
    if (!event) {
      throw new NotFoundException(`Event with id "${id}" not found`);
    }
    return event;
  }

  async remove(id: string): Promise<void> {
    const event = await this.findOne(id);
    // Use repository.remove (not delete) so the M2M join rows are cleaned up.
    await this.eventsRepository.remove(event);
  }

  /**
   * Merge all overlapping events the given user is invited to.
   *
   * Runs inside a single transaction with a pessimistic_write lock on the
   * user row, which serializes concurrent merge calls for the same user.
   * Source events that participate in a merge are deleted; one new event
   * replaces each merged group, with the union of invitees attached. The
   * call is idempotent: if no overlaps exist, the user's events are
   * returned unchanged with no DB writes.
   */
  async mergeAllForUser(userId: string): Promise<Event[]> {
    return this.dataSource.transaction(async (em) => {
      const user = await em.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw new NotFoundException(`User with id "${userId}" not found`);
      }

      const userEvents = await this.loadUserEvents(em, userId);
      if (userEvents.length === 0) {
        return [];
      }

      const groups = mergeOverlappingEvents(userEvents.map(toMergeInput));
      const mergedGroups = groups.filter((g) => g.sourceIds.length > 1);

      if (mergedGroups.length === 0) {
        // No overlaps - already in canonical form.
        return userEvents;
      }

      // Resolve every unique invitee id across all merged groups in one query.
      const inviteeIds = new Set<string>();
      for (const g of mergedGroups) {
        for (const id of g.inviteeIds) {
          inviteeIds.add(id);
        }
      }
      const inviteeUsers = await em.find(User, {
        where: { id: In([...inviteeIds]) },
      });
      const inviteesById = new Map(inviteeUsers.map((u) => [u.id, u]));

      for (const g of mergedGroups) {
        const merged = em.create(Event, {
          title: g.title,
          description: g.description,
          status: g.status,
          startTime: g.startTime,
          endTime: g.endTime,
          invitees: g.inviteeIds
            .map((id) => inviteesById.get(id))
            .filter((u): u is User => u !== undefined),
        });
        await em.save(merged);
      }

      const sourceIdsToDelete = new Set<string>();
      for (const g of mergedGroups) {
        for (const id of g.sourceIds) {
          sourceIdsToDelete.add(id);
        }
      }
      const eventsToDelete = userEvents.filter((e) =>
        sourceIdsToDelete.has(e.id),
      );
      // remove (not delete) so the M2M join rows go with the source events.
      await em.remove(eventsToDelete);

      return this.loadUserEvents(em, userId);
    });
  }

  private async resolveInvitees(inviteeIds?: string[]): Promise<User[]> {
    if (!inviteeIds || inviteeIds.length === 0) {
      return [];
    }
    const users = await this.usersRepository.find({
      where: { id: In(inviteeIds) },
    });
    if (users.length !== inviteeIds.length) {
      const foundIds = new Set(users.map((u) => u.id));
      const missing = inviteeIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Invitee user(s) not found: ${missing.join(', ')}`,
      );
    }
    return users;
  }

  /**
   * Load every event the given user is invited to, with the full invitees
   * relation populated so the merge algorithm can compute the union without
   * extra round-trips.
   */
  private async loadUserEvents(
    em: EntityManager,
    userId: string,
  ): Promise<Event[]> {
    return em
      .createQueryBuilder(Event, 'event')
      .leftJoinAndSelect('event.invitees', 'invitee')
      .where((qb) => {
        const sub = qb
          .subQuery()
          .select('ei.event_id')
          .from('event_invitees', 'ei')
          .where('ei.user_id = :userId')
          .getQuery();
        return `event.id IN ${sub}`;
      })
      .setParameter('userId', userId)
      .orderBy('event.startTime', 'ASC')
      .addOrderBy('event.endTime', 'ASC')
      .getMany();
  }
}

function toMergeInput(event: Event): MergeInput {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    status: event.status,
    startTime: event.startTime,
    endTime: event.endTime,
    invitees: event.invitees.map((u) => ({ id: u.id })),
  };
}
