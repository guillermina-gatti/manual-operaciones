import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListVersionsQuery } from './list-versions.query';

async function check(plain: Record<string, unknown>) {
  const query = plainToInstance(ListVersionsQuery, plain);
  const errors = await validate(query, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { query, failed: errors.map((error) => error.property) };
}

describe('ListVersionsQuery (spec 015, R8)', () => {
  it('defaults to page 1 and 20 per page', async () => {
    const { query, failed } = await check({});

    expect(failed).toEqual([]);
    expect(query).toMatchObject({ page: 1, limit: 20 });
  });

  it('reads the values from the text of the URL', async () => {
    const { query, failed } = await check({ page: '2', limit: '100' });

    expect(failed).toEqual([]);
    expect(query).toMatchObject({ page: 2, limit: 100 });
  });

  it.each([
    ['limit 101', { limit: '101' }, 'limit'],
    ['limit 0', { limit: '0' }, 'limit'],
    ['page 0', { page: '0' }, 'page'],
    ['a page that is not a number', { page: 'abc' }, 'page'],
  ])('rejects %s', async (_case, plain, field) => {
    const { failed } = await check(plain);

    expect(failed).toEqual([field]);
  });
});
