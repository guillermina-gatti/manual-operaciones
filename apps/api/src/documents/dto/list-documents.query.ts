/*Define los parámetros de filtrado, paginación o búsqueda cuando alguien quiere listar o buscar documentos
(lo que usualmente viaja en la URL como Query Parameters, ej: ?status=ACTIVE&page=1). */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Paginación del listado (R13). Los valores de la query llegan como texto y se convierten a número.
export class ListDocumentsQuery {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  // Más de 100 es un error, no se ajusta (D3).
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
