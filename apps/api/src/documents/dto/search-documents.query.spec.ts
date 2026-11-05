// Validación de la búsqueda (spec 004, R4 y R10; plan 004, 1.1 y D14).
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchDocumentsQuery } from './search-documents.query';

// Las mismas opciones que el ValidationPipe global del plan 001 (whitelist, forbidNonWhitelisted, transform).
async function check(plain: Record<string, unknown>) {
  const query = plainToInstance(SearchDocumentsQuery, plain);
  const errors = await validate(query, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { query, failed: errors.map((error) => error.property) };
}

describe('SearchDocumentsQuery', () => {
  it('con q válido usa page 1 y limit 20', async () => {
    const { query, failed } = await check({ q: 'caja' });

    expect(failed).toEqual([]);
    expect(query).toMatchObject({ q: 'caja', page: 1, limit: 20 });
  });

  it('quita los espacios del principio y del final', async () => {
    const { query, failed } = await check({ q: '  caja  ' });

    expect(failed).toEqual([]);
    expect(query.q).toBe('caja');
  });

  it.each([
    ['caj', 3],
    ['a'.repeat(100), 100],
  ])('acepta "%s" (%i caracteres)', async (q) => {
    const { failed } = await check({ q });

    expect(failed).toEqual([]);
  });

  // E9 y R4: entre 3 y 100 caracteres, sin contar los espacios de los extremos.
  it.each([
    ['ca'],
    ['  ca  '],
    ['   '],
    [''],
    ['a'.repeat(101)],
  ])('rechaza q = "%s"', async (q) => {
    const { failed } = await check({ q });

    expect(failed).toEqual(['q']);
  });

  it('rechaza la búsqueda sin q', async () => {
    const { failed } = await check({});

    expect(failed).toEqual(['q']);
  });

  it('rechaza q repetido (?q=a&q=b llega como arreglo)', async () => {
    const { failed } = await check({ q: ['caja', 'stock'] });

    expect(failed).toEqual(['q']);
  });

  // R10 y D14: la paginación valida igual que el listado.
  it('convierte page y limit a números', async () => {
    const { query, failed } = await check({ q: 'caja', page: '2', limit: '100' });

    expect(failed).toEqual([]);
    expect(query).toMatchObject({ page: 2, limit: 100 });
  });

  it.each([
    ['limit', '101'],
    ['limit', '0'],
    ['page', '0'],
    ['page', 'abc'],
  ])('falla con %s=%s', async (field, value) => {
    const { failed } = await check({ q: 'caja', [field]: value });

    expect(failed).toEqual([field]);
  });

  it('falla con un parámetro que no está en la query', async () => {
    const { failed } = await check({ q: 'caja', sort: 'title' });

    expect(failed).toEqual(['sort']);
  });
});
