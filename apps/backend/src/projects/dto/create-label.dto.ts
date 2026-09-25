import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsHexColor, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateLabelDto {
  @ApiProperty({ example: 'frontend' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  name: string;

  @ApiPropertyOptional({ example: '#228BE6' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}
