/* Body to publish a draft (spec 015, R2 and R5). Everything is optional: {} publishes a normal change.
Summary of a critical change: the rule "required if it is critical" is added with the critical change.
A field that is present is always checked, also if it is null (IsOptional would let null through) */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Length, ValidateIf } from 'class-validator';
import { trim } from './transforms';

const isPresent = (_object: unknown, value: unknown) => value !== undefined;

export class PublishVersionDto {
  @ApiPropertyOptional({ default: false })
  @ValidateIf(isPresent)
  @IsBoolean()
  isCritical?: boolean;

  @ApiPropertyOptional({ minLength: 1, maxLength: 300 })
  @ValidateIf(isPresent)
  @Transform(trim)
  @IsString()
  @Length(1, 300)
  changeSummary?: string;
}
