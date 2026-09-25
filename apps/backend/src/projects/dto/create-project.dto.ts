import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'Web Platform' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiProperty({
    example: 'WEB',
    description:
      '2-10 uppercase letters/digits, starting with a letter. Prefixes issue keys (WEB-12).',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z][A-Z0-9]{1,9}$/, {
    message: 'Key must be 2-10 characters: letters and digits, starting with a letter',
  })
  key: string;

  @ApiPropertyOptional({ example: 'Customer-facing web app' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
