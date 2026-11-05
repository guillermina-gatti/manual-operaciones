/* Cuerpo de POST /conflict-alerts/:id/resolve (spec 011, R15, D12): una nota opcional. Una nota vacía
o solo con espacios se guarda como null; eso lo decide el servicio */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export const RESOLUTION_NOTE_MAX = 500;

export class ResolveConflictAlertDto {
  @ApiPropertyOptional({
    maxLength: RESOLUTION_NOTE_MAX,
    example: 'Corregida la política en la v2',
  })
  @IsOptional()
  @IsString()
  @MaxLength(RESOLUTION_NOTE_MAX)
  note?: string;
}
