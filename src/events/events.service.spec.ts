import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { Event } from './entities/event.entity';
import { EventStatus } from './enums/event-status.enum';
import { EventsService } from './events.service';

type MockRepo<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

const buildMockRepo = <T extends object>(): MockRepo<T> => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  remove: jest.fn(),
});

describe('EventsService', () => {
  let service: EventsService;
  let eventsRepo: MockRepo<Event>;
  let usersRepo: MockRepo<User>;

  const dto: CreateEventDto = {
    title: 'Standup',
    description: 'Daily',
    status: EventStatus.TODO,
    startTime: '2026-05-05T14:00:00.000Z',
    endTime: '2026-05-05T15:00:00.000Z',
    inviteeIds: [],
  };

  beforeEach(async () => {
    eventsRepo = buildMockRepo<Event>();
    usersRepo = buildMockRepo<User>();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useValue: eventsRepo },
        { provide: getRepositoryToken(User), useValue: usersRepo },
      ],
    }).compile();

    service = moduleRef.get(EventsService);
  });

  describe('create', () => {
    it('creates an event with empty invitees and re-reads with relations', async () => {
      const draft = { id: 'draft' } as unknown as Event;
      const saved = { id: 'event-1' } as unknown as Event;
      const reread = { id: 'event-1', invitees: [] } as unknown as Event;
      eventsRepo.create.mockReturnValue(draft);
      eventsRepo.save.mockResolvedValue(saved);
      eventsRepo.findOne.mockResolvedValue(reread);

      const result = await service.create(dto);

      expect(usersRepo.find).not.toHaveBeenCalled();
      expect(eventsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Standup',
          description: 'Daily',
          status: EventStatus.TODO,
          startTime: new Date(dto.startTime),
          endTime: new Date(dto.endTime),
          invitees: [],
        }),
      );
      expect(eventsRepo.save).toHaveBeenCalledWith(draft);
      expect(eventsRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        relations: { invitees: true },
      });
      expect(result).toBe(reread);
    });

    it('resolves invitee user entities and stores them on the event', async () => {
      const ada = { id: 'ada-id', name: 'Ada' } as User;
      const grace = { id: 'grace-id', name: 'Grace' } as User;
      usersRepo.find.mockResolvedValue([ada, grace]);
      eventsRepo.create.mockReturnValue({} as Event);
      eventsRepo.save.mockResolvedValue({ id: 'event-1' } as Event);
      eventsRepo.findOne.mockResolvedValue({ id: 'event-1' } as Event);

      await service.create({ ...dto, inviteeIds: ['ada-id', 'grace-id'] });

      expect(usersRepo.find).toHaveBeenCalledWith({
        where: { id: In(['ada-id', 'grace-id']) },
      });
      expect(eventsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ invitees: [ada, grace] }),
      );
    });

    it('throws NotFoundException when an invitee id does not resolve', async () => {
      const ada = { id: 'ada-id', name: 'Ada' } as User;
      usersRepo.find.mockResolvedValue([ada]);

      await expect(
        service.create({ ...dto, inviteeIds: ['ada-id', 'missing-id'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(eventsRepo.save).not.toHaveBeenCalled();
    });

    it('coerces a missing description to null', async () => {
      eventsRepo.create.mockReturnValue({} as Event);
      eventsRepo.save.mockResolvedValue({ id: 'event-1' } as Event);
      eventsRepo.findOne.mockResolvedValue({ id: 'event-1' } as Event);

      const { description: _omit, ...withoutDescription } = dto;
      await service.create(withoutDescription as CreateEventDto);

      expect(eventsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: null }),
      );
    });
  });

  describe('findOne', () => {
    it('returns the event when found', async () => {
      const event = { id: 'event-1' } as Event;
      eventsRepo.findOne.mockResolvedValue(event);

      await expect(service.findOne('event-1')).resolves.toBe(event);
    });

    it('throws NotFoundException when missing', async () => {
      eventsRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('loads the event with invitees and calls repository.remove', async () => {
      const event = { id: 'event-1', invitees: [] } as unknown as Event;
      eventsRepo.findOne.mockResolvedValue(event);

      await service.remove('event-1');

      expect(eventsRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        relations: { invitees: true },
      });
      expect(eventsRepo.remove).toHaveBeenCalledWith(event);
    });

    it('propagates NotFoundException when the event does not exist', async () => {
      eventsRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(eventsRepo.remove).not.toHaveBeenCalled();
    });
  });
});
