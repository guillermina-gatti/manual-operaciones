import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProcedureMetricsQueryDto } from './procedure-metrics.query';

const AREA_ID = '0a000000-0000-4000-8000-000000000001';

// The same options as the global ValidationPipe (whitelist, forbidNonWhitelisted).
async function failedFields(plain: Record<string, unknown>) {
  const errors = await validate(
    plainToInstance(ProcedureMetricsQueryDto, plain),
    { whitelist: true, forbidNonWhitelisted: true },
  );
  return errors.map((error) => error.property);
}

describe('ProcedureMetricsQueryDto', () => {
  it('every parameter is optional', async () => {
    expect(await failedFields({})).toEqual([]);
  });

  it('accepts an area and a period', async () => {
    expect(
      await failedFields({
        areaId: AREA_ID,
        from: '2026-10-01',
        to: '2026-10-27',
      }),
    ).toEqual([]);
  });

  it.each([
    ['areaId', 'ventas'],
    ['from', '2026-02-30'],
    ['from', '01/10/2026'],
    ['to', '2026-10-27T23:59:59Z'],
    ['to', ''],
  ])('rejects %s=%s', async (field, value) => {
    expect(await failedFields({ [field]: value })).toEqual([field]);
  });

  it('rejects a parameter it does not know', async () => {
    expect(await failedFields({ userId: AREA_ID })).toEqual(['userId']);
  });
});
