import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PublishVersionDto } from './publish-version.dto';

// Same options as the global ValidationPipe (whitelist, forbidNonWhitelisted, transform).
async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(PublishVersionDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, failed: errors.map((error) => error.property) };
}

describe('PublishVersionDto (spec 015, R2 and R5)', () => {
  it.each([
    ['an empty body (publish without a critical change, D8)', {}],
    ['only isCritical false', { isCritical: false }],
    ['a summary without isCritical', { changeSummary: 'Ajuste de texto' }],
    ['a critical change with its summary', { isCritical: true, changeSummary: 'Cambia el límite' }],
  ])('accepts %s', async (_case, plain) => {
    const { failed } = await check(plain);

    expect(failed).toEqual([]);
  });

  it('trims the spaces around the summary', async () => {
    const { dto } = await check({ changeSummary: '  Cambia el límite  ' });

    expect(dto.changeSummary).toBe('Cambia el límite');
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['301 characters', 'a'.repeat(301)],
    ['not a text', 42],
  ])('rejects the summary when it is %s', async (_case, changeSummary) => {
    const { failed } = await check({ changeSummary });

    expect(failed).toEqual(['changeSummary']);
  });

  it('accepts a summary of exactly 300 characters', async () => {
    const { failed } = await check({ changeSummary: 'a'.repeat(300) });

    expect(failed).toEqual([]);
  });

  it.each([['"true" as text', 'true'], ['a number', 1], ['null', null]])(
    'rejects isCritical when it is %s',
    async (_case, isCritical) => {
      const { failed } = await check({ isCritical });

      expect(failed).toEqual(['isCritical']);
    },
  );

  it('rejects a field that does not exist (D8)', async () => {
    const { failed } = await check({ publishedById: 'x' });

    expect(failed).toEqual(['publishedById']);
  });
});
