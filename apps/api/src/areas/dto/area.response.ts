import { ApiProperty } from '@nestjs/swagger';

// Contrato A-06.2: devolver solamente los tres campos públicos del catálogo.
export class AreaResponse {
  @ApiProperty({ format: 'uuid', example: '0a000000-0000-4000-8000-000000000001' })
  id!: string;

  @ApiProperty({ example: 'Ventas' })
  name!: string;

  @ApiProperty({ type: Boolean, example: true })
  isActive!: boolean;
}
