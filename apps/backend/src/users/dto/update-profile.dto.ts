import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsHexColor, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: 'jane' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z0-9_-]{3,30}$/, {
    message: 'Username must be 3-30 characters: lowercase letters, numbers, _ or -',
  })
  username?: string;

  @ApiPropertyOptional({ example: '#4C6EF5' })
  @IsOptional()
  @IsHexColor()
  avatarColor?: string;
}
