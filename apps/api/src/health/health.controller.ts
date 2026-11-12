import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get('live')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({
    description: 'El proceso HTTP de la API está activo',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
      },
      required: ['status'],
    },
  })
  live(this: void): { status: 'ok' } {
    return { status: 'ok' };
  }
}
