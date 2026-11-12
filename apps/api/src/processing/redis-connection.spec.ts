import { redisConnectionFromUrl } from './redis-connection';

describe('redisConnectionFromUrl', () => {
  it('toma host, puerto y base de una URL simple', () => {
    expect(redisConnectionFromUrl('redis://localhost:6379/1')).toMatchObject({
      host: 'localhost',
      port: 6379,
      db: 1,
    });
  });

  it('usa el puerto y la base por defecto si no se indican', () => {
    expect(redisConnectionFromUrl('redis://cache.internal')).toMatchObject({ port: 6379, db: 0 });
  });

  it('lee usuario y contraseña, decodificando caracteres especiales', () => {
    expect(redisConnectionFromUrl('redis://:p%40ss@host:6380')).toMatchObject({
      host: 'host',
      port: 6380,
      password: 'p@ss',
    });
  });

  it('usa TLS con rediss://', () => {
    expect(redisConnectionFromUrl('rediss://host:6380')).toHaveProperty('tls');
  });

  it('rechaza un protocolo que no es redis', () => {
    expect(() => redisConnectionFromUrl('http://localhost:6379')).toThrow('redis://');
  });

  it('no incluye la URL en el error cuando no es válida (puede tener la contraseña)', () => {
    expect(() => redisConnectionFromUrl('redis://:secreto@[mal')).toThrow('REDIS_URL no es una URL válida');
    try {
      redisConnectionFromUrl('redis://:secreto@[mal');
    } catch (error) {
      expect((error as Error).message).not.toContain('secreto');
    }
  });

  it('rechaza un número de base inválido', () => {
    expect(() => redisConnectionFromUrl('redis://localhost:6379/abc')).toThrow('número de base inválido');
  });
});