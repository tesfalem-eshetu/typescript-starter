import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Display name of the user.',
    example: 'Ada Lovelace',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
