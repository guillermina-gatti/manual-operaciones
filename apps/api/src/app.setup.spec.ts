import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  INestApplication,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { configureApp } from './app.setup';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { resolveHttpSecurityPolicy } from './http-security';

@Controller('probe')
class HttpProbeController {
  @Get()
  probe(@Req() req: Request): { ip: string | undefined } {
    return { ip: req.ip };
  }
}

const LOGIN_BODY = {
  email: 'persona@example.com',
  password: 'Password-de-prueba-2026!',
};

async function createApp(environment: Record<string, unknown>): Promise<{
  app: INestApplication;
  login: jest.Mock;
}> {
  const attempts = new Map<string, number>();
  const login = jest.fn(
    async (
      _dto: unknown,
      metadata: { ipAddress: string | null },
    ): Promise<Record<string, unknown>> => {
      const ip = metadata.ipAddress ?? 'sin-ip';
      const count = (attempts.get(ip) ?? 0) + 1;
      attempts.set(ip, count);
      if (count > 1) {
        throw new HttpException('Límite por IP', HttpStatus.TOO_MANY_REQUESTS);
      }
      return {
        accessToken: 'access-token-de-prueba',
        refreshToken: 'refresh-token-de-prueba',
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Persona Prueba',
          email: LOGIN_BODY.email,
          role: 'EMPLOYEE',
        },
      };
    },
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [HttpProbeController, AuthController],
    providers: [
      {
        provide: AuthService,
        useValue: {
          login,
          refresh: jest.fn(),
          logout: jest.fn(),
          validateInvitation: jest.fn(),
          registerWithInvitation: jest.fn(),
        },
      },
      {
        provide: ConfigService,
        useValue: {
          get: (name: string) => environment[name],
        },
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app, environment);
  await app.init();
  return { app, login };
}

describe('configuración HTTP global', () => {
  const apps: INestApplication[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function configuredApp(environment: Record<string, unknown>) {
    const result = await createApp(environment);
    apps.push(result.app);
    return result;
  }

  it('mantiene Swagger en desarrollo y lo deshabilita por defecto en producción', async () => {
    const development = await configuredApp({ NODE_ENV: 'development' });
    await request(development.app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);

    const production = await configuredApp({ NODE_ENV: 'production' });
    await request(production.app.getHttpServer())
      .get('/api/docs-json')
      .expect(404);
  });

  it('permite publicar Swagger en producción sólo con opt-in explícito', async () => {
    const { app } = await configuredApp({
      NODE_ENV: 'production',
      SWAGGER_ENABLED: 'true',
    });

    await request(app.getHttpServer()).get('/api/docs-json').expect(200);
  });

  it('ignora X-Forwarded-For sin proxy confiable y conserva el rate limit por IP real', async () => {
    const { app, login } = await configuredApp({ NODE_ENV: 'test' });

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.20')
      .send(LOGIN_BODY)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.21')
      .send(LOGIN_BODY)
      .expect(429);

    const observedIps = login.mock.calls.map(
      (call: unknown[]) => (call[1] as { ipAddress: string }).ipAddress,
    );
    expect(observedIps[0]).toBe(observedIps[1]);
    expect(observedIps).not.toContain('198.51.100.20');
    expect(observedIps).not.toContain('203.0.113.21');
  });

  it('usa el primer salto no confiable y evita que el cliente fuerce la IP más lejana', async () => {
    const { app, login } = await configuredApp({
      NODE_ENV: 'test',
      HTTP_TRUSTED_PROXIES: '127.0.0.0/8,::1/128',
    });

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.99, 203.0.113.30')
      .send(LOGIN_BODY)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.99, 203.0.113.31')
      .send(LOGIN_BODY)
      .expect(200);

    expect(login.mock.calls.map((call) => call[1].ipAddress)).toEqual([
      '203.0.113.30',
      '203.0.113.31',
    ]);
  });

  it('agrega cabeceras conservadoras y no revela Express', async () => {
    const { app } = await configuredApp({ NODE_ENV: 'test' });
    const response = await request(app.getHttpServer())
      .get('/api/probe')
      .expect(200);

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['permissions-policy']).toBe(
      'camera=(), geolocation=(), microphone=()',
    );
    expect(response.headers['strict-transport-security']).toBeUndefined();
    expect(response.headers['content-security-policy']).toBeUndefined();
  });

  it.each([
    ['proxy booleano amplio', 'true'],
    ['cantidad de saltos', '1'],
    ['hostname', 'proxy.internal'],
    ['CIDR inválido', '10.0.0.0/33'],
    ['CIDR IPv4 universal', '0.0.0.0/0'],
    ['CIDR IPv6 universal', '::/0'],
    ['entrada vacía', '10.0.0.1,,10.0.0.2'],
    ['duplicado', '10.0.0.1,10.0.0.1'],
  ])('rechaza %s en HTTP_TRUSTED_PROXIES', (_caseName, value) => {
    expect(() =>
      resolveHttpSecurityPolicy({ HTTP_TRUSTED_PROXIES: value }),
    ).toThrow(/HTTP_TRUSTED_PROXIES/);
  });

  it.each(['TRUE', '1', 'yes'])('rechaza SWAGGER_ENABLED=%s', (value) => {
    expect(() => resolveHttpSecurityPolicy({ SWAGGER_ENABLED: value })).toThrow(
      /SWAGGER_ENABLED/,
    );
  });
});
