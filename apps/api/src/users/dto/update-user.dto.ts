import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import type { Role } from '../../common/auth';

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: ['ADMIN', 'SUPERVISOR', 'EMPLOYEE'] })
  @IsOptional()
  @IsEnum(['ADMIN', 'SUPERVISOR', 'EMPLOYEE'])
  role?: Role;

  @ApiPropertyOptional({ type: [String], example: ['0a000000-0000-4000-8000-000000000001'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  areaIds?: string[];

  @ApiPropertyOptional({ type: Boolean, example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
