import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsAfter } from '../../common/validators/is-after.validator';
import { EventStatus } from '../enums/event-status.enum';

export class CreateEventDto {
  @ApiProperty({ example: 'Project kickoff', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    example: 'Quarterly planning session',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: EventStatus, example: EventStatus.TODO })
  @IsEnum(EventStatus)
  status!: EventStatus;

  @ApiProperty({
    description: 'ISO 8601 timestamp marking when the event begins.',
    example: '2026-05-05T14:00:00.000Z',
  })
  @IsISO8601()
  startTime!: string;

  @ApiProperty({
    description:
      'ISO 8601 timestamp marking when the event ends. Must be strictly after startTime.',
    example: '2026-05-05T15:00:00.000Z',
  })
  @IsISO8601()
  @IsAfter('startTime')
  endTime!: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Optional list of user ids to invite.',
    example: [],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  inviteeIds?: string[];
}
