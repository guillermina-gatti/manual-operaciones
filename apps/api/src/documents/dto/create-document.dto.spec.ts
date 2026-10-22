//Es el archivo de pruebas (test) para el DTO
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDocumentDto } from './create-document.dto';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const OPERACIONES = '0a000000-0000-4000-8000-000000000002';
const OWNER = '0b000000-0000-4000-8000-000000000003';

const valid = {
  title: 'Manual de caja',
  areaIds: [VENTAS],
  ownerId: OWNER,
  reviewDate: '2027-03-01',
};

// Las mismas opciones que el ValidationPipe global del plan (whitelist, forbidNonWhitelisted, transform).
async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateDocumentDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, failed: errors.map((error) => error.property) };
}

describe('CreateDocumentDto', () => {
  it('acepta una carga válida', async () => {
    await expect(check(valid)).resolves.toMatchObject({ failed: [] });
  });

  describe('title', () => {
    it('quita los espacios del principio y del final', async () => {
      const { dto, failed } = await check({ ...valid, title: '  Manual  ' });

      expect(failed).toEqual([]);
      expect(dto.title).toBe('Manual');
    });

    it('falla si son solo espacios', async () => {
      const { failed } = await check({ ...valid, title: '   ' });

      expect(failed).toEqual(['title']);
    });

    it('falla con 201 caracteres', async () => {
      const { failed } = await check({ ...valid, title: 'a'.repeat(201) });

      expect(failed).toEqual(['title']);
    });

    it('acepta 200 caracteres', async () => {
      const { failed } = await check({ ...valid, title: 'a'.repeat(200) });

      expect(failed).toEqual([]);
    });
  });

  describe('areaIds', () => {
    it('falla si está vacío', async () => {
      const { failed } = await check({ ...valid, areaIds: [] });

      expect(failed).toEqual(['areaIds']);
    });

    it('falla si falta', async () => {
      const { areaIds: _omitted, ...withoutAreas } = valid;
      const { failed } = await check(withoutAreas);

      expect(failed).toEqual(['areaIds']);
    });

    it('convierte un valor suelto en arreglo', async () => {
      const { dto, failed } = await check({ ...valid, areaIds: VENTAS });

      expect(failed).toEqual([]);
      expect(dto.areaIds).toEqual([VENTAS]);
    });

    it('elimina los repetidos', async () => {
      const { dto, failed } = await check({
        ...valid,
        areaIds: [VENTAS, OPERACIONES, VENTAS],
      });

      expect(failed).toEqual([]);
      expect(dto.areaIds).toEqual([VENTAS, OPERACIONES]);
    });

    it('falla si un área no es UUID', async () => {
      const { failed } = await check({ ...valid, areaIds: [VENTAS, 'ventas'] });

      expect(failed).toEqual(['areaIds']);
    });
  });

  it('falla si ownerId no es UUID', async () => {
    const { failed } = await check({ ...valid, ownerId: 'admin' });

    expect(failed).toEqual(['ownerId']);
  });

  describe('reviewDate', () => {
    it('falla con una fecha que no existe', async () => {
      const { failed } = await check({ ...valid, reviewDate: '2027-02-30' });

      expect(failed).toEqual(['reviewDate']);
    });

    it('falla con otro formato', async () => {
      const { failed } = await check({ ...valid, reviewDate: '01/03/2027' });

      expect(failed).toEqual(['reviewDate']);
    });

    it('falla con fecha y hora', async () => {
      const { failed } = await check({
        ...valid,
        reviewDate: '2027-03-01T10:00:00Z',
      });

      expect(failed).toEqual(['reviewDate']);
    });
  });

  describe('description', () => {
    it('es opcional', async () => {
      const { dto, failed } = await check(valid);

      expect(failed).toEqual([]);
      expect(dto.description).toBeUndefined();
    });

    it('acepta 1000 caracteres', async () => {
      const { failed } = await check({
        ...valid,
        description: 'a'.repeat(1000),
      });

      expect(failed).toEqual([]);
    });

    it('falla con 1001 caracteres', async () => {
      const { failed } = await check({
        ...valid,
        description: 'a'.repeat(1001),
      });

      expect(failed).toEqual(['description']);
    });
  });

  it('falla con un campo que no está en el DTO', async () => {
    const { failed } = await check({ ...valid, status: 'ARCHIVED' });

    expect(failed).toEqual(['status']);
  });
});
