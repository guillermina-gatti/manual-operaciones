// DTO con las reglas opcionales para registrar una nueva versión de un documento.
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, Matches } from 'class-validator';

export class CreateVersionDto {
  // Queda como texto, como en la carga: la comparación con "mañana" la hace el servicio.
  // Si no viene, el documento conserva su fecha de revisión.
  @ApiPropertyOptional({ format: 'date', example: '2027-03-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'reviewDate tiene que tener el formato YYYY-MM-DD',
  })
  @IsISO8601({ strict: true })
  reviewDate?: string;
}
