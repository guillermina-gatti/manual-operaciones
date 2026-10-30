// DTO de "Marcar como revisado" (spec 005, R7): solo la fecha de revisión nueva, obligatoria.
import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, Matches } from 'class-validator';

export class MarkReviewedDto {
  // Las mismas validaciones que en la carga (CreateDocumentDto.reviewDate). Queda como texto: la
  // comparación con mañana, en hora de Argentina, la hace el servicio.
  @ApiProperty({ format: 'date', example: '2027-05-09' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'reviewDate tiene que tener el formato YYYY-MM-DD',
  })
  @IsISO8601({ strict: true })
  reviewDate: string;
}
