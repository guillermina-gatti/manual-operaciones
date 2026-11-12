/* Data to create a procedure (spec 006, R2). The owner is the ADMIN who creates it, never a field */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { trim } from './transforms';

export class CreateProcedureDto {
  @ApiProperty({ minLength: 1, maxLength: 200, example: 'Cierre de caja' })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  title: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
