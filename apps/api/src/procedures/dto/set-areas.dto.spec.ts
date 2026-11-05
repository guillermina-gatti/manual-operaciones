import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetAreasDto } from './set-areas.dto';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';

// Same options as the global ValidationPipe (whitelist, forbidNonWhitelisted, transform).
async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(SetAreasDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, failed: errors.map((error) => error.property) };
}

describe('SetAreasDto (spec 006, R11)', () => {
  it('accepts several areas', async () => {
    const { dto, failed } = await check({ areaIds: [VENTAS, OPERACIONES] });

    expect(failed).toEqual([]);
    expect(dto.areaIds).toEqual([VENTAS, OPERACIONES]);
  });

  it('accepts an empty list: a procedure can be left without areas', async () => {
    await expect(check({ areaIds: [] })).resolves.toMatchObject({ failed: [] });
  });

  it('E18: rejects a repeated area instead of dropping it', async () => {
    const { failed } = await check({ areaIds: [VENTAS, VENTAS] });

    expect(failed).toEqual(['areaIds']);
  });

  it.each([
    ['missing', {}],
    ['a single id, not a list', { areaIds: VENTAS }],
    ['an id that is not a UUID', { areaIds: [VENTAS, 'ventas'] }],
  ])('rejects areaIds when it is %s', async (_case, plain) => {
    const { failed } = await check(plain);

    expect(failed).toEqual(['areaIds']);
  });

  it('rejects unknown properties, such as an ownerId', async () => {
    const { failed } = await check({ areaIds: [VENTAS], ownerId: VENTAS });

    expect(failed).toEqual(['ownerId']);
  });
});
