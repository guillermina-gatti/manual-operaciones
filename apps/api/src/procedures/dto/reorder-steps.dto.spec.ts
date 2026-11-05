import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReorderStepsDto } from './reorder-steps.dto';

const A = '1c000000-0000-4000-8000-000000000001';
const B = '1c000000-0000-4000-8000-000000000002';

// Same options as the global ValidationPipe (whitelist, forbidNonWhitelisted, transform).
async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(ReorderStepsDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, failed: errors.map((error) => error.property) };
}

describe('ReorderStepsDto (spec 006, R8)', () => {
  it('accepts a list of step ids', async () => {
    const { dto, failed } = await check({ stepIds: [B, A] });

    expect(failed).toEqual([]);
    expect(dto.stepIds).toEqual([B, A]);
  });

  it('accepts an empty list (the version has no steps)', async () => {
    await expect(check({ stepIds: [] })).resolves.toMatchObject({ failed: [] });
  });

  it('leaves repeated or missing steps to reorderSteps, which has the rule', async () => {
    await expect(check({ stepIds: [A, A] })).resolves.toMatchObject({
      failed: [],
    });
  });

  it.each([
    ['missing', {}],
    ['a single id, not a list', { stepIds: A }],
    ['an id that is not a UUID', { stepIds: [A, 'paso-2'] }],
    ['numbers', { stepIds: [1, 2] }],
  ])('rejects stepIds when it is %s', async (_case, plain) => {
    const { failed } = await check(plain);

    expect(failed).toEqual(['stepIds']);
  });

  it('rejects unknown properties', async () => {
    const { failed } = await check({ stepIds: [A], versionId: B });

    expect(failed).toEqual(['versionId']);
  });
});
