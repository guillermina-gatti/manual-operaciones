/* Parámetros de GET /conflict-alerts (spec 011, R14): el estado y la paginación del listado (spec 001,
R13), con los mismos nombres y límites que ListDocumentsQuery */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const CONFLICT_ALERT_STATUSES = ['OPEN', 'RESOLVED'] as const;
export type ConflictAlertStatus = (typeof CONFLICT_ALERT_STATUSES)[number];

export class ListConflictAlertsQuery {
  @ApiPropertyOptional({ enum: CONFLICT_ALERT_STATUSES, default: 'OPEN' })
  @IsOptional()
  @IsIn(CONFLICT_ALERT_STATUSES)
  status: ConflictAlertStatus = 'OPEN';

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
