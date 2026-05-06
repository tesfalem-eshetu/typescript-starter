import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CreateEventDto } from './dto/create-event.dto';
import { EventResponseDto } from './dto/event-response.dto';
import { EventsService } from './events.service';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new event.' })
  @ApiCreatedResponse({ type: EventResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed.' })
  @ApiNotFoundResponse({ description: 'One or more invitee ids are unknown.' })
  async create(@Body() dto: CreateEventDto): Promise<EventResponseDto> {
    const event = await this.eventsService.create(dto);
    return EventResponseDto.fromEntity(event);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Retrieve an event by its event id. The response includes the invitee list.',
  })
  @ApiParam({
    name: 'id',
    description: 'The event id (UUIDv4) returned from POST /events.',
    format: 'uuid',
  })
  @ApiOkResponse({ type: EventResponseDto })
  @ApiNotFoundResponse({ description: 'Event not found.' })
  async findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<EventResponseDto> {
    const event = await this.eventsService.findOne(id);
    return EventResponseDto.fromEntity(event);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an event by its event id.' })
  @ApiParam({
    name: 'id',
    description: 'The event id (UUIDv4) of the event to delete.',
    format: 'uuid',
  })
  @ApiNoContentResponse({ description: 'Event deleted.' })
  @ApiNotFoundResponse({ description: 'Event not found.' })
  async remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.eventsService.remove(id);
  }
}
