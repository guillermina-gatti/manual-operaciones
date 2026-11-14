// Query of GET /metrics/me/daily: only the optional area. No dates: the server decides
// the window (the last 21 days and the current week), so from or to are a 400.
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class MyDailyMetricsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Only the days of the procedures currently in this area, one of the active areas of the user. The week ignores it',
  })
  @IsOptional()
  @IsUUID('all')
  areaId?: string;
}
