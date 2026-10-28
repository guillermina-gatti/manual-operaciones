// Query of GET /metrics/procedures: optional area and period. The viewer comes from
// the session; whether the area is theirs is decided by the service.
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateBy } from 'class-validator';
import { isCalendarDate } from '../metrics-period';

// "YYYY-MM-DD" and a day that exists. A full date-time is rejected: days are the
// company's, not instants.
const IsCalendarDate = () =>
  ValidateBy({
    name: 'isCalendarDate',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && isCalendarDate(value),
      defaultMessage: () =>
        '$property debe ser una fecha AAAA-MM-DD que exista',
    },
  });

export class ProcedureMetricsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Only procedures currently assigned to this area. A SUPERVISOR can only ask for one of their areas',
  })
  @IsOptional()
  @IsUUID('all')
  areaId?: string;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description:
      'First day, inclusive, in the company time zone. Applies to when the execution started',
  })
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-10-27',
    description: 'Last day, inclusive, in the company time zone',
  })
  @IsOptional()
  @IsCalendarDate()
  to?: string;
}
