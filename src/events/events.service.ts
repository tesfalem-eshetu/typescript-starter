import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { Event } from './entities/event.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
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
}
