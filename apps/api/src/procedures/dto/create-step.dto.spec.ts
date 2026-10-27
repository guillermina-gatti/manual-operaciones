import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStepDto } from './create-step.dto';

// Same options as the global ValidationPipe (whitelist, forbidNonWhitelisted, transform).
async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateStepDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, failed: errors.map((error) => error.property) };
}

describe('CreateStepDto (spec 006, R6 and R7)', () => {
  it('accepts a title alone', async () => {
    const { dto, failed } = await check({ title: 'Contar el efectivo' });

    expect(failed).toEqual([]);
    expect(dto.description).toBeUndefined();
    expect(dto.position).toBeUndefined();
  });

  it('accepts a title, a description and a position', async () => {
    await expect(
      check({ title: 'Contar', description: 'Billetes y monedas', position: 2 }),
    ).resolves.toMatchObject({ failed: [] });
  });

  it('trims the spaces around the title', async () => {
    const { dto } = await check({ title: '  Contar  ' });

    expect(dto.title).toBe('Contar');
  });

  it('accepts the limits: a 200-character title and a 2000-character description', async () => {
    const { failed } = await check({
      title: 'a'.repeat(200),
      description: 'd'.repeat(2000),
    });

    expect(failed).toEqual([]);
  });

  it.each([
    ['missing', {}],
    ['only spaces', { title: '   ' }],
    ['201 characters', { title: 'a'.repeat(201) }],
  ])('rejects the title when it is %s', async (_case, plain) => {
    const { failed } = await check(plain);

    expect(failed).toEqual(['title']);
  });

  it('rejects a description of 2001 characters', async () => {
    const { failed } = await check({
      title: 'Contar',
      description: 'd'.repeat(2001),
    });

    expect(failed).toEqual(['description']);
  });

  it.each([0, -3, 1.5, '2'])('rejects the position %p', async (position) => {
    const { failed } = await check({ title: 'Contar', position });

    expect(failed).toEqual(['position']);
  });

  it('rejects unknown properties, such as an order: the place is given with position', async () => {
    const { failed } = await check({ title: 'Contar', order: 2 });

    expect(failed).toEqual(['order']);
  });
});
