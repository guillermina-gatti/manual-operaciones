import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { type ReadinessResult, ReadinessService } from './readiness.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

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

  @Public()
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ description: 'PostgreSQL y Redis están disponibles' })
  @ApiServiceUnavailableResponse({
    description: 'Una dependencia esencial está caída o excedió el timeout',
  })
  async ready(): Promise<ReadinessResult> {
    const result = await this.readiness.check();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
