import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Event } from '../entities/event.entity';
import { EventStatus } from '../enums/event-status.enum';

export class InviteeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class EventResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: EventStatus })
  status!: EventStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  startTime!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  endTime!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: [InviteeDto] })
  invitees!: InviteeDto[];

  static fromEntity(event: Event): EventResponseDto {
    const dto = new EventResponseDto();
    dto.id = event.id;
    dto.title = event.title;
    dto.description = event.description;
    dto.status = event.status;
    dto.startTime = event.startTime;
    dto.endTime = event.endTime;
    dto.createdAt = event.createdAt;
    dto.updatedAt = event.updatedAt;
    dto.invitees = (event.invitees ?? []).map((u) => ({
      id: u.id,
      name: u.name,
    }));
    return dto;
  }
}
