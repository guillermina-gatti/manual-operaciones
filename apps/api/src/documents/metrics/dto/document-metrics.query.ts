// Filtros de GET /metrics/documents (spec 007, R7): área y período opcionales, con las mismas
// validaciones que las métricas de procedimientos. Si el área es del usuario lo decide el servicio.
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateBy } from 'class-validator';
import { isCalendarDate } from '../metrics-rules';

// "YYYY-MM-DD" y un día que exista. El validador de la pareja B no está exportado (D4): este es
// igual, armado sobre la misma isCalendarDate y con el mismo mensaje.
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

export class DocumentMetricsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Solo los documentos que tienen esta área. Un SUPERVISOR solo puede pedir una de sus áreas',
  })
  @IsOptional()
  @IsUUID('all')
  areaId?: string;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description:
      'Primer día, inclusive, en hora de la empresa. Solo filtra `uploaded` (cuándo se cargó el documento)',
  })
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description:
      'Último día, inclusive, en hora de la empresa. Solo filtra `uploaded`',
  })
  @IsOptional()
  @IsCalendarDate()
  to?: string;
}
