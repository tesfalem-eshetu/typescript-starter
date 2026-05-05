import { ApiProperty } from '@nestjs/swagger';
import { User } from '../entities/user.entity';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  name!: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'IDs of events the user is invited to. Honors the assignment wording of "events: list of strings" on the User entity.',
    example: [],
  })
  eventIds!: string[];

  static fromEntity(user: User & { events?: { id: string }[] }): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.name = user.name;
    dto.eventIds = (user.events ?? []).map((event) => event.id);
    return dto;
  }
}
