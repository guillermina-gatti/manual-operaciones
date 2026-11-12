/* Pruebas de los filtros de las métricas de documentos (spec 007, R7; T03) */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DocumentMetricsQueryDto } from './document-metrics.query';

const AREA_ID = '0a000000-0000-4000-8000-000000000001';

// Las mismas opciones que el ValidationPipe global (whitelist, forbidNonWhitelisted).
async function failedFields(plain: Record<string, unknown>) {
  const errors = await validate(
    plainToInstance(DocumentMetricsQueryDto, plain),
    { whitelist: true, forbidNonWhitelisted: true },
  );
  return errors.map((error) => error.property);
}

describe('DocumentMetricsQueryDto', () => {
  it('todo es opcional', async () => {
    expect(await failedFields({})).toEqual([]);
  });

  it('acepta un área y un período', async () => {
    expect(
      await failedFields({
        areaId: AREA_ID,
        from: '2026-10-10',
        to: '2026-10-31',
      }),
    ).toEqual([]);
  });

  it.each([
    ['areaId', 'ventas'],
    ['from', '2026-02-30'],
    ['from', '01/10/2026'],
    ['to', '2026-10-27T23:59:59Z'],
    ['to', ''],
  ])('E10: rechaza %s=%s', async (field, value) => {
    expect(await failedFields({ [field]: value })).toEqual([field]);
  });

  it('rechaza un parámetro que no conoce', async () => {
    expect(await failedFields({ userId: AREA_ID })).toEqual(['userId']);
  });
});
