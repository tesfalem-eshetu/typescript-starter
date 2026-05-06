import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { CreateEventDto } from './events/dto/create-event.dto';
import { Event } from './events/entities/event.entity';
import { EventStatus } from './events/enums/event-status.enum';
import { EventsService } from './events/events.service';
import { UsersService } from './users/users.service';

/**
 * Seed the local database with demo data so the merge endpoint can be
 * exercised immediately. Idempotent: wipes the events + users tables on
 * every run so re-seeding always produces the same state.
 *
 * Run with: `npm run seed`
 */
async function seed(): Promise<void> {
  const logger = new Logger('seed');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get(DataSource);
    const usersService = app.get(UsersService);
    const eventsService = app.get(EventsService);

    logger.log('Wiping existing data...');
    // CASCADE clears the M2M join rows along with parents in a single round-trip.
    await dataSource.query(
      'TRUNCATE TABLE "events", "users" RESTART IDENTITY CASCADE',
    );

    logger.log('Creating users...');
    const ada = await usersService.create({ name: 'Ada Lovelace' });
    const grace = await usersService.create({ name: 'Grace Hopper' });
    const linus = await usersService.create({ name: 'Linus Torvalds' });

    logger.log('Creating events for Ada (overlapping, ready to merge)...');
    const adaEvents: CreateEventDto[] = [
      {
        title: 'Architecture review',
        description: 'Walk through the new ingestion pipeline.',
        status: EventStatus.IN_PROGRESS,
        startTime: '2026-06-01T14:00:00.000Z',
        endTime: '2026-06-01T15:00:00.000Z',
        inviteeIds: [ada.id, grace.id],
      },
      {
        title: 'Roadmap sync',
        description: 'Q3 priorities and dependencies.',
        status: EventStatus.TODO,
        startTime: '2026-06-01T14:45:00.000Z',
        endTime: '2026-06-01T16:00:00.000Z',
        inviteeIds: [ada.id, linus.id],
      },
      {
        title: 'Design critique',
        description: 'Feedback on the new dashboard layout.',
        status: EventStatus.TODO,
        startTime: '2026-06-01T15:30:00.000Z',
        endTime: '2026-06-01T17:00:00.000Z',
        inviteeIds: [ada.id, grace.id, linus.id],
      },
      {
        title: 'Standalone 1:1',
        description: null,
        status: EventStatus.TODO,
        startTime: '2026-06-02T10:00:00.000Z',
        endTime: '2026-06-02T10:30:00.000Z',
        inviteeIds: [ada.id, grace.id],
      },
    ];
    const createdAdaEvents: Event[] = [];
    for (const dto of adaEvents) {
      createdAdaEvents.push(await eventsService.create(dto));
    }

    logger.log('Creating a non-overlapping event for Grace...');
    await eventsService.create({
      title: 'Compiler talk prep',
      description: 'Slides and demo for the COBOL retrospective.',
      status: EventStatus.IN_PROGRESS,
      startTime: '2026-06-03T09:00:00.000Z',
      endTime: '2026-06-03T10:00:00.000Z',
      inviteeIds: [grace.id],
    });

    const baseUrl = `http://localhost:${app.get(ConfigService).get<number>('port', 3000)}`;

    logger.log('--------------------------------------------------------');
    logger.log('Seed complete.');
    logger.log(`  Ada Lovelace   : ${ada.id}`);
    logger.log(`  Grace Hopper   : ${grace.id}`);
    logger.log(`  Linus Torvalds : ${linus.id}`);
    logger.log('');
    logger.log(
      `Ada has ${createdAdaEvents.length} events; the first 3 overlap.`,
    );
    logger.log('Try the merge endpoint:');
    logger.log(`  curl -X POST ${baseUrl}/users/${ada.id}/events/merge`);
    logger.log('--------------------------------------------------------');
  } finally {
    await app.close();
  }
}

void seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
