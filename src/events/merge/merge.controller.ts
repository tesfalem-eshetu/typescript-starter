import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { EventResponseDto } from '../dto/event-response.dto';
import { EventsService } from '../events.service';

/**
 * User-scoped merge endpoint. Lives on its own controller so the route
 * `/users/:userId/events/merge` reflects ownership in the URL while the
 * implementation stays inside the events module.
 */
@ApiTags('events')
@Controller('users/:userId/events')
export class MergeController {
  constructor(private readonly eventsService: EventsService) {}

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Merge all overlapping events the user is invited to. ' +
      'Source events are deleted and replaced by one event per overlap group.',
  })
  @ApiParam({
    name: 'userId',
    description:
      'The user id (UUIDv4) whose events should be merged. ' +
      'Only events the user is invited to are considered.',
    format: 'uuid',
  })
  @ApiOkResponse({
    type: [EventResponseDto],
    description:
      'The user’s events after merging, ordered by start time. ' +
      'Returns an empty list when the user has no events.',
  })
  @ApiNotFoundResponse({ description: 'User not found.' })
  async mergeAll(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ): Promise<EventResponseDto[]> {
    const events = await this.eventsService.mergeAllForUser(userId);
    return events.map((event) => EventResponseDto.fromEntity(event));
  }
}
