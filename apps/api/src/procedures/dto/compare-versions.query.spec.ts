import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CompareVersionsQuery } from './compare-versions.query';

const FROM = '1b000000-0000-4000-8000-000000000001';
const TO = '1b000000-0000-4000-8000-000000000002';

async function check(plain: Record<string, unknown>) {
  const query = plainToInstance(CompareVersionsQuery, plain);
  const errors = await validate(query, { whitelist: true, forbidNonWhitelisted: true });
  return { query, failed: errors.map((error) => error.property).sort() };
}

describe('CompareVersionsQuery (spec 015, R10)', () => {
  it('accepts two ids', async () => {
    const { query, failed } = await check({ from: FROM, to: TO });

    expect(failed).toEqual([]);
    expect(query).toMatchObject({ from: FROM, to: TO });
  });

  it.each([
    ['from is missing', { to: TO }, ['from']],
    ['to is missing', { from: FROM }, ['to']],
    ['both are missing', {}, ['from', 'to']],
    ['from is not a UUID', { from: 'xyz', to: TO }, ['from']],
    ['to is not a UUID', { from: FROM, to: '123' }, ['to']],
  ])('rejects it when %s, naming the field', async (_case, plain, fields) => {
    const { failed } = await check(plain);

    expect(failed).toEqual(fields);
  });

  it('rejects a parameter that does not exist', async () => {
    const { failed } = await check({ from: FROM, to: TO, other: '1' });

    expect(failed).toEqual(['other']);
  });
});
