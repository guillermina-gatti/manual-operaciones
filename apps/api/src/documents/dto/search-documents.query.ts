/* Parámetros de la búsqueda de documentos (spec 004): el texto y la misma paginación del listado */
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { ListDocumentsQuery } from './list-documents.query';

// Mismos límites que apps/web/lib/documents/search-rules.ts (SEARCH_MIN, SEARCH_MAX).
export const SEARCH_MIN = 3;
export const SEARCH_MAX = 100;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// R4: el texto se cuenta sin los espacios del principio y del final. Los demás caracteres llegan
// tal cual a la consulta, que los trata como texto (plan 004, 3.3). page y limit se heredan (R10, D14).
export class SearchDocumentsQuery extends ListDocumentsQuery {
  @ApiProperty({
    minLength: SEARCH_MIN,
    maxLength: SEARCH_MAX,
    example: 'cierre de caja',
    description: 'Palabras a buscar en el título, la descripción y el contenido',
  })
  @Transform(trim)
  @IsString()
  @Length(SEARCH_MIN, SEARCH_MAX)
  q: string;
}
