/* Data to add a step to a draft (spec 006, R6 and R7) */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { trim } from './transforms';

export class CreateStepDto {
  @ApiProperty({ minLength: 1, maxLength: 200, example: 'Contar el efectivo' })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  title: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // 1 to n + 1; the service checks the upper bound against the steps of the draft (R7).
  @ApiPropertyOptional({
    minimum: 1,
    description: 'Place of the new step (1 to n + 1); at the end when omitted',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;
}
