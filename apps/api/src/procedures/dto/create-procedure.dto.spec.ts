import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProcedureDto } from './create-procedure.dto';

// Same options as the global ValidationPipe (whitelist, forbidNonWhitelisted, transform).
async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateProcedureDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, failed: errors.map((error) => error.property) };
}

describe('CreateProcedureDto (spec 006, R2)', () => {
  it('accepts a title alone', async () => {
    const { dto, failed } = await check({ title: 'Cierre de caja' });

    expect(failed).toEqual([]);
    expect(dto.description).toBeUndefined();
  });

  it('accepts a title and a description', async () => {
    await expect(
      check({ title: 'Cierre de caja', description: 'Al final del turno' }),
    ).resolves.toMatchObject({ failed: [] });
  });

  it('trims the spaces around the title', async () => {
    const { dto } = await check({ title: '  Cierre de caja  ' });

    expect(dto.title).toBe('Cierre de caja');
  });

  it('accepts the limits: 200 characters not counting the outer spaces, and a 1000-character description', async () => {
    const { failed } = await check({
      title: `${'a'.repeat(200)}   `,
      description: 'd'.repeat(1000),
    });

    expect(failed).toEqual([]);
  });

  it.each([
    ['missing', {}],
    ['empty', { title: '' }],
    ['only spaces', { title: '   ' }],
    ['201 characters', { title: 'a'.repeat(201) }],
    ['a number', { title: 42 }],
  ])('rejects the title when it is %s', async (_case, plain) => {
    const { failed } = await check(plain);

    expect(failed).toEqual(['title']);
  });

  it('rejects a description of 1001 characters', async () => {
    const { failed } = await check({
      title: 'Cierre',
      description: 'd'.repeat(1001),
    });

    expect(failed).toEqual(['description']);
  });

  it('rejects unknown properties, such as an ownerId (the owner is who creates it)', async () => {
    const { failed } = await check({
      title: 'Cierre',
      ownerId: '0b000000-0000-4000-8000-000000000003',
    });

    expect(failed).toEqual(['ownerId']);
  });
});
