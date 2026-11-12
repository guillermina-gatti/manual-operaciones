import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangeAreasDto } from './change-areas.dto';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const OWNER = '0b000000-0000-4000-8000-000000000003';

// Las mismas opciones que el ValidationPipe global (whitelist, forbidNonWhitelisted, transform).
async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(ChangeAreasDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, failed: errors.map((error) => error.property) };
}

describe('ChangeAreasDto (spec 003, R3 y R4)', () => {
  it('acepta solo las áreas, sin responsable', async () => {
    const { dto, failed } = await check({ areaIds: [VENTAS, OPERACIONES] });

    expect(failed).toEqual([]);
    expect(dto.ownerId).toBeUndefined();
  });

  it('acepta las áreas con un responsable', async () => {
    await expect(
      check({ areaIds: [VENTAS], ownerId: OWNER }),
    ).resolves.toMatchObject({ failed: [] });
  });

  describe('areaIds', () => {
    it('falla si está vacío', async () => {
      const { failed } = await check({ areaIds: [] });

      expect(failed).toEqual(['areaIds']);
    });

    it('falla si falta', async () => {
      const { failed } = await check({ ownerId: OWNER });

      expect(failed).toEqual(['areaIds']);
    });

    it('convierte un valor suelto en arreglo', async () => {
      const { dto, failed } = await check({ areaIds: VENTAS });

      expect(failed).toEqual([]);
      expect(dto.areaIds).toEqual([VENTAS]);
    });

    it('elimina los repetidos', async () => {
      const { dto, failed } = await check({
        areaIds: [VENTAS, VENTAS, OPERACIONES],
      });

      expect(failed).toEqual([]);
      expect(dto.areaIds).toEqual([VENTAS, OPERACIONES]);
    });

    it('falla si un valor no es un UUID', async () => {
      const { failed } = await check({ areaIds: [VENTAS, 'ventas'] });

      expect(failed).toEqual(['areaIds']);
    });
  });

  describe('ownerId', () => {
    it('falla si no es un UUID', async () => {
      const { failed } = await check({ areaIds: [VENTAS], ownerId: 'ana' });

      expect(failed).toEqual(['ownerId']);
    });
  });

  it('rechaza los campos de más', async () => {
    const { failed } = await check({ areaIds: [VENTAS], title: 'Otro' });

    expect(failed).toEqual(['title']);
  });
});
