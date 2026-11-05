import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateStepDto } from './update-step.dto';

// Same options as the global ValidationPipe (whitelist, forbidNonWhitelisted, transform).
async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(UpdateStepDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, failed: errors.map((error) => error.property) };
}

describe('UpdateStepDto (spec 006, R6)', () => {
  it.each([
    ['only the title', { title: 'Contar' }],
    ['only the description', { description: 'Billetes y monedas' }],
    ['an empty description, to clear it', { description: '' }],
    ['nothing (the service answers 400 for an empty change)', {}],
  ])('accepts %s', async (_case, plain) => {
    const { failed } = await check(plain);

    expect(failed).toEqual([]);
  });

  it('trims the spaces around the title', async () => {
    const { dto } = await check({ title: ' Contar ' });

    expect(dto.title).toBe('Contar');
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['201 characters', 'a'.repeat(201)],
  ])('rejects the title when it is %s', async (_case, title) => {
    const { failed } = await check({ title });

    expect(failed).toEqual(['title']);
  });

  it('rejects a description of 2001 characters', async () => {
    const { failed } = await check({ description: 'd'.repeat(2001) });

    expect(failed).toEqual(['description']);
  });

  it('rejects a position: moving a step is reordering (R8)', async () => {
    const { failed } = await check({ title: 'Contar', position: 1 });

    expect(failed).toEqual(['position']);
  });
});
