/* Spec 011 (T08, R14): los parámetros de GET /conflict-alerts */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListConflictAlertsQuery } from './list-conflict-alerts.query';

const check = async (query: Record<string, string>) => {
  const dto = plainToInstance(ListConflictAlertsQuery, query);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors: errors.map((error) => error.property) };
};

describe('ListConflictAlertsQuery (R14)', () => {
  it('sin parámetros: abiertas, página 1, de a 20', async () => {
    const { dto, errors } = await check({});

    expect(errors).toEqual([]);
    expect(dto).toMatchObject({ status: 'OPEN', page: 1, limit: 20 });
  });

  it('acepta las resueltas y convierte los números', async () => {
    const { dto, errors } = await check({
      status: 'RESOLVED',
      page: '2',
      limit: '50',
    });

    expect(errors).toEqual([]);
    expect(dto).toMatchObject({ status: 'RESOLVED', page: 2, limit: 50 });
  });

  it.each([
    [{ status: 'open' }, 'status'],
    [{ status: 'CLOSED' }, 'status'],
    [{ page: '0' }, 'page'],
    [{ limit: '101' }, 'limit'],
    [{ limit: 'diez' }, 'limit'],
    [{ userId: 'x' }, 'userId'],
  ])('rechaza %j', async (query, property) => {
    expect((await check(query)).errors).toEqual([property]);
  });
});
