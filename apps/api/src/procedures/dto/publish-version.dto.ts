/* Body to publish a draft (spec 015, R2 and R5). Everything is optional: {} publishes a normal change.
A critical change needs its summary (D14). A field that is present is always checked, also if it is
null (IsOptional would let null through) */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Length, ValidateIf } from 'class-validator';
import { trim } from './transforms';

const isPresent = (_object: unknown, value: unknown) => value !== undefined;

// The summary is checked when it comes, and also when it is missing but the change is critical.
const needsSummary = (object: PublishVersionDto, value: unknown) =>
  value !== undefined || object.isCritical === true;

export class PublishVersionDto {
  @ApiPropertyOptional({ default: false })
  @ValidateIf(isPresent)
  @IsBoolean()
  isCritical?: boolean;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 300,
    description: 'Obligatorio si isCritical es true',
  })
  @ValidateIf(needsSummary)
  @Transform(trim)
  @IsString()
  @Length(1, 300)
  changeSummary?: string;
}
