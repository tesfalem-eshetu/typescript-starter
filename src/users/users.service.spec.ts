import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

type MockRepo<T extends object = User> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

const buildMockRepo = (): MockRepo => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let repo: MockRepo;

  beforeEach(async () => {
    repo = buildMockRepo();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('create', () => {
    it('persists a new user with the provided name and returns the saved entity', async () => {
      const draft = { name: 'Ada Lovelace' } as User;
      const saved = { id: 'uuid-1', name: 'Ada Lovelace' } as User;
      repo.create!.mockReturnValue(draft);
      repo.save!.mockResolvedValue(saved);

      const result = await service.create({ name: 'Ada Lovelace' });

      expect(repo.create).toHaveBeenCalledWith({ name: 'Ada Lovelace' });
      expect(repo.save).toHaveBeenCalledWith(draft);
      expect(result).toBe(saved);
    });
  });

  describe('findOne', () => {
    it('returns the user when found', async () => {
      const user = { id: 'uuid-1', name: 'Ada Lovelace' } as User;
      repo.findOne!.mockResolvedValue(user);

      await expect(service.findOne('uuid-1')).resolves.toBe(user);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'uuid-1' } });
    });

    it('throws NotFoundException when no user matches the id', async () => {
      repo.findOne!.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
