import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateVersionDto } from './update-version.dto';

// Same options as the global ValidationPipe (whitelist, forbidNonWhitelisted, transform).
async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(UpdateVersionDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, failed: errors.map((error) => error.property) };
}

describe('UpdateVersionDto (spec 006, R5)', () => {
  it.each([
    ['only the title', { title: 'Cierre de caja' }],
    ['only the description', { description: 'Nueva descripción' }],
    ['both', { title: 'Cierre', description: 'Desc' }],
    ['nothing (the service answers 400 for an empty change)', {}],
  ])('accepts %s', async (_case, plain) => {
    const { failed } = await check(plain);

    expect(failed).toEqual([]);
  });

  it('trims the spaces around the title', async () => {
    const { dto } = await check({ title: ' Cierre ' });

    expect(dto.title).toBe('Cierre');
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['201 characters', 'a'.repeat(201)],
  ])('rejects the title when it is %s', async (_case, title) => {
    const { failed } = await check({ title });

    expect(failed).toEqual(['title']);
  });

  it('rejects a description of 1001 characters', async () => {
    const { failed } = await check({ description: 'd'.repeat(1001) });

    expect(failed).toEqual(['description']);
  });

  it('rejects any other property, so a PATCH cannot publish a version', async () => {
    const { failed } = await check({ title: 'Cierre', status: 'PUBLISHED' });

    expect(failed).toEqual(['status']);
  });
});
