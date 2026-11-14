import { validateEnvironment } from './environment.validation';

const STRONG_JWT_SECRET = 'secreto-productivo-aleatorio-de-32-caracteres';

function productionEnvironment(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL:
      'postgresql://app:password@db.internal:5432/manual?sslmode=require',
    JWT_SECRET: STRONG_JWT_SECRET,
    REDIS_URL: 'rediss://redis.internal:6380/0',
    S3_BUCKET: 'pispiar-production',
    AWS_REGION: 'us-east-1',
    PORT: '3000',
    APP_TIMEZONE: 'America/Argentina/Buenos_Aires',
    PROCESSING_WORKER_ENABLED: 'true',
    ...overrides,
  };
}

describe('validateEnvironment', () => {
  it('acepta la configuración productiva mínima válida', () => {
    const environment = productionEnvironment();

    expect(validateEnvironment(environment)).toBe(environment);
  });

  it('acepta capacidades opcionales deshabilitadas', () => {
    expect(
      validateEnvironment(
        productionEnvironment({
          INVITATION_EMAIL_PROVIDER: undefined,
          GOOGLE_GENERATIVE_AI_API_KEY: undefined,
          GEMINI_CHAT_MODEL: undefined,
        }),
      ),
    ).toBeDefined();
  });

  it.each(['DATABASE_URL', 'JWT_SECRET', 'S3_BUCKET'])(
    'rechaza %s ausente en producción',
    (name) => {
      expect(() =>
        validateEnvironment(productionEnvironment({ [name]: undefined })),
      ).toThrow(new RegExp(name));
    },
  );

  it.each([
    ['ausente', undefined],
    ['localhost', 'redis://localhost:6379'],
    ['IPv4 loopback', 'redis://127.0.0.1:6379'],
    ['IPv6 loopback', 'redis://[::1]:6379'],
    ['host de Docker Desktop', 'redis://host.docker.internal:6379'],
  ])('rechaza REDIS_URL %s en producción', (_caseName, redisUrl) => {
    expect(() =>
      validateEnvironment(productionEnvironment({ REDIS_URL: redisUrl })),
    ).toThrow(/REDIS_URL/);
  });

  it('rechaza un JWT_SECRET corto en producción sin incluirlo en el error', () => {
    const weakSecret = 'demasiado-corto';

    expect(() =>
      validateEnvironment(productionEnvironment({ JWT_SECRET: weakSecret })),
    ).toThrow(/JWT_SECRET/);

    try {
      validateEnvironment(productionEnvironment({ JWT_SECRET: weakSecret }));
    } catch (error) {
      expect((error as Error).message).not.toContain(weakSecret);
    }
  });

  it.each([
    ['DATABASE_URL', { DATABASE_URL: 'mysql://db.internal/manual' }],
    ['DATABASE_URL', { DATABASE_URL: 'no-es-una-url' }],
    ['REDIS_URL', { REDIS_URL: 'http://redis.internal' }],
    ['REDIS_URL', { REDIS_URL: 'redis://redis.internal/no-es-una-base' }],
    ['REDIS_URL', { REDIS_URL: 'redis://redis.internal:0' }],
  ])('rechaza una %s inválida', (_name, override) => {
    expect(() => validateEnvironment(productionEnvironment(override))).toThrow(
      /Configuración inválida/,
    );
  });

  it('no incluye una URL de conexión ni sus credenciales en el error', () => {
    const unsafeUrl = 'http://usuario:secreto-no-real@redis.internal:6379';

    try {
      validateEnvironment(productionEnvironment({ REDIS_URL: unsafeUrl }));
      throw new Error('La validación debía fallar');
    } catch (error) {
      expect((error as Error).message).not.toContain(unsafeUrl);
      expect((error as Error).message).not.toContain('secreto-no-real');
    }
  });

  it('no impone un esquema TLS antes de la decisión del proveedor', () => {
    expect(() =>
      validateEnvironment(
        productionEnvironment({
          DATABASE_URL: 'postgresql://app:password@db.internal:5432/manual',
          REDIS_URL: 'redis://redis.internal:6379/0',
        }),
      ),
    ).not.toThrow();
  });

  it.each([
    [
      'DATABASE_URL',
      {
        DATABASE_URL:
          'postgresql://app:password@db.internal/manual?sslmode=disable',
      },
    ],
    ['REDIS_URL', { REDIS_URL: 'redis://redis.internal:6379?tls=false' }],
    ['S3_ENDPOINT', { S3_ENDPOINT: 'https://s3.internal?ssl=false' }],
  ])('rechaza desactivar TLS explícitamente en %s', (_name, override) => {
    expect(() => validateEnvironment(productionEnvironment(override))).toThrow(
      /TLS/,
    );
  });

  it.each(['', '0', '65536', '3000.5', 'puerto'])('rechaza PORT=%s', (port) => {
    expect(() =>
      validateEnvironment(productionEnvironment({ PORT: port })),
    ).toThrow(/PORT/);
  });

  it('rechaza una zona horaria inválida', () => {
    expect(() =>
      validateEnvironment(
        productionEnvironment({ APP_TIMEZONE: 'Argentina/Inexistente' }),
      ),
    ).toThrow(/APP_TIMEZONE/);
  });

  it.each(['TRUE', '0', 'yes', ''])(
    'rechaza PROCESSING_WORKER_ENABLED=%s',
    (value) => {
      expect(() =>
        validateEnvironment(
          productionEnvironment({ PROCESSING_WORKER_ENABLED: value }),
        ),
      ).toThrow(/PROCESSING_WORKER_ENABLED/);
    },
  );

  it('valida Resend sólo cuando se habilita explícitamente', () => {
    expect(() =>
      validateEnvironment(
        productionEnvironment({ INVITATION_EMAIL_PROVIDER: 'resend' }),
      ),
    ).toThrow(/RESEND_API_KEY/);

    expect(() =>
      validateEnvironment(
        productionEnvironment({
          INVITATION_EMAIL_PROVIDER: 'resend',
          RESEND_API_KEY: 'clave-no-real',
          INVITATION_EMAIL_FROM: 'PispIAr <invitaciones@example.com>',
          FRONTEND_URL: 'https://app.example.com',
        }),
      ),
    ).not.toThrow();
  });

  it('valida la configuración S3 sin exigir credenciales cuando hay rol', () => {
    expect(() =>
      validateEnvironment(
        productionEnvironment({
          S3_ENDPOINT: 'ftp://s3.internal',
        }),
      ),
    ).toThrow(/S3_ENDPOINT/);

    expect(() =>
      validateEnvironment(
        productionEnvironment({
          AWS_ACCESS_KEY_ID: 'identificador-no-real',
        }),
      ),
    ).toThrow(/AWS_ACCESS_KEY_ID\/AWS_SECRET_ACCESS_KEY/);

    expect(() => validateEnvironment(productionEnvironment())).not.toThrow();
  });

  it('valida Gemini sólo cuando se configura un modelo', () => {
    expect(() =>
      validateEnvironment(
        productionEnvironment({ GEMINI_CHAT_MODEL: 'modelo-configurado' }),
      ),
    ).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);

    expect(() =>
      validateEnvironment(
        productionEnvironment({
          GEMINI_CHAT_MODEL: 'modelo-configurado',
          GOOGLE_GENERATIVE_AI_API_KEY: 'clave-no-real',
        }),
      ),
    ).not.toThrow();
  });

  it('preserva defaults y destinos locales en desarrollo', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'development' }),
    ).not.toThrow();
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL:
          'postgresql://app:app@localhost:5432/manual?sslmode=disable',
        REDIS_URL: 'redis://localhost:6379?tls=false',
        JWT_SECRET: 'local',
        INVITATION_EMAIL_PROVIDER: 'local',
      }),
    ).not.toThrow();
  });

  it.each(['true', '1', 'proxy.internal', '10.0.0.0/33', '10.0.0.1,,10.0.0.2'])(
    'rechaza HTTP_TRUSTED_PROXIES=%s',
    (trustedProxies) => {
      expect(() =>
        validateEnvironment({
          NODE_ENV: 'development',
          HTTP_TRUSTED_PROXIES: trustedProxies,
        }),
      ).toThrow(/HTTP_TRUSTED_PROXIES/);
    },
  );

  it.each(['TRUE', '1', 'yes'])('rechaza SWAGGER_ENABLED=%s', (value) => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'development', SWAGGER_ENABLED: value }),
    ).toThrow(/SWAGGER_ENABLED/);
  });
});
