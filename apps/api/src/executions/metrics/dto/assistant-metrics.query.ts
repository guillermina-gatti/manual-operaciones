// Query of GET /metrics/assistant: optional area and period, like the procedures metrics.
// The viewer comes from the session; whether the area is theirs is decided by the service.
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { IsCalendarDate } from './procedure-metrics.query';

export class AssistantMetricsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Only questions of people who currently belong to this area. A SUPERVISOR can only ask for one of their areas',
  })
  @IsOptional()
  @IsUUID('all')
  areaId?: string;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description:
      'First day, inclusive, in the company time zone. Applies to when the question was asked',
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
