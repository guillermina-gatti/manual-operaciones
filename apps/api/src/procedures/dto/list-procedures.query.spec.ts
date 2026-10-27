import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListProceduresQuery } from './list-procedures.query';

// Same options as the global ValidationPipe (whitelist, forbidNonWhitelisted, transform).
async function check(plain: Record<string, unknown>) {
  const query = plainToInstance(ListProceduresQuery, plain);
  const errors = await validate(query, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { query, failed: errors.map((error) => error.property) };
}

describe('ListProceduresQuery (spec 006, R16)', () => {
  it('uses page 1 and limit 20 without parameters', async () => {
    const { query, failed } = await check({});

    expect(failed).toEqual([]);
    expect(query).toMatchObject({ page: 1, limit: 20 });
  });

  it('converts the query values to numbers', async () => {
    const { query, failed } = await check({ page: '3', limit: '100' });

    expect(failed).toEqual([]);
    expect(query).toMatchObject({ page: 3, limit: 100 });
  });

  it.each([
    ['limit', '101'],
    ['limit', '0'],
    ['page', '0'],
    ['page', 'abc'],
    ['page', '1.5'],
  ])('rejects %s=%s', async (field, value) => {
    const { failed } = await check({ [field]: value });

    expect(failed).toEqual([field]);
  });

  it('rejects a parameter that is not in the query', async () => {
    const { failed } = await check({ sort: 'title' });

    expect(failed).toEqual(['sort']);
  });
});
