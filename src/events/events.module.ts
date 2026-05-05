import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { Event } from './entities/event.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { MergeController } from './merge/merge.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Event]), UsersModule],
  controllers: [EventsController, MergeController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
