// Response classes of GET /metrics/me/daily (Swagger) and the field-by-field mapping from
// the service view. Only the viewer's own executions: no user id.
import { ApiProperty } from '@nestjs/swagger';
import type { MyDailyView } from '../my-metrics.service';

const DAY = { example: '2026-11-13', description: 'YYYY-MM-DD, company day' };

export class MyDailyProcedureResponse {
  @ApiProperty({ format: 'uuid' })
  procedureId: string;

  @ApiProperty({
    example: 'Cierre de caja',
    type: String,
    nullable: true,
    description:
      'The title of the version completed last in the window; null when the catalog does not give it',
  })
  title: string | null;

  @ApiProperty({ example: 2, description: 'Executions completed that day' })
  completed: number;
}

export class MyDailyDayResponse {
  @ApiProperty(DAY)
  date: string;

  @ApiProperty({
    type: [MyDailyProcedureResponse],
    description: 'Empty on a day without completed executions',
  })
  procedures: MyDailyProcedureResponse[];
}

export class MyDailyWeekResponse {
  @ApiProperty({ ...DAY, example: '2026-11-09', description: 'Monday' })
  from: string;

  @ApiProperty({ ...DAY, description: 'Friday' })
  to: string;

  @ApiProperty({
    type: [String],
    example: ['2026-11-09', '2026-11-11'],
    description:
      'Monday to Friday days with a step finished or an execution completed, every area',
  })
  activeDays: string[];

  @ApiProperty({
    example: 3,
    description: 'Executions completed from Monday to Sunday, every area',
  })
  completedCount: number;
}

export class MyDailyMetricsResponse {
  @ApiProperty({ ...DAY, example: '2026-10-24', description: 'First day' })
  windowFrom: string;

  @ApiProperty({ ...DAY, description: 'Today' })
  windowTo: string;

  @ApiProperty({
    type: [MyDailyDayResponse],
    description: 'The 21 days of the window, ascending, also the empty ones',
  })
  days: MyDailyDayResponse[];

  @ApiProperty({
    type: MyDailyWeekResponse,
    description:
      'The current week; on Saturday and Sunday, the one that just ended',
  })
  week: MyDailyWeekResponse;
}

export const toMyDailyMetricsResponse = (
  view: MyDailyView,
): MyDailyMetricsResponse => ({
  windowFrom: view.windowFrom,
  windowTo: view.windowTo,
  days: view.days.map((day) => ({
    date: day.date,
    procedures: day.procedures.map((procedure) => ({
      procedureId: procedure.procedureId,
      title: procedure.title,
      completed: procedure.completed,
    })),
  })),
  week: {
    from: view.week.from,
    to: view.week.to,
    activeDays: [...view.week.activeDays],
    completedCount: view.week.completedCount,
  },
});
