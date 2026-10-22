import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListDocumentsQuery } from './list-documents.query';

// Las mismas opciones que el ValidationPipe global del plan (whitelist, forbidNonWhitelisted, transform).
async function check(plain: Record<string, unknown>) {
  const query = plainToInstance(ListDocumentsQuery, plain);
  const errors = await validate(query, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { query, failed: errors.map((error) => error.property) };
}

describe('ListDocumentsQuery', () => {
  it('sin parámetros usa page 1 y limit 20', async () => {
    const { query, failed } = await check({});

    expect(failed).toEqual([]);
    expect(query).toMatchObject({ page: 1, limit: 20 });
  });

  it('convierte los valores de la query a números', async () => {
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
  ])('falla con %s=%s', async (field, value) => {
    const { failed } = await check({ [field]: value });

    expect(failed).toEqual([field]);
  });

  it('falla con un parámetro que no está en la query', async () => {
    const { failed } = await check({ sort: 'title' });

    expect(failed).toEqual(['sort']);
  });
});
