import { InMemoryProcedureAreasCatalog } from './in-memory-procedure-areas.catalog';

const VENTAS = '0a000000-0000-4000-8000-000000000001';
const INACTIVA = '0a000000-0000-4000-8000-000000000003';
const MISSING = '0a000000-0000-4000-8000-000000000099';

describe('InMemoryProcedureAreasCatalog', () => {
  const catalog = new InMemoryProcedureAreasCatalog([
    { id: VENTAS, isActive: true },
    { id: INACTIVA, isActive: false },
  ]);

  describe('findStates', () => {
    it('returns the state of the areas that exist and leaves out the others', async () => {
      await expect(
        catalog.findStates([INACTIVA, MISSING, VENTAS]),
      ).resolves.toEqual([
        { id: INACTIVA, isActive: false },
        { id: VENTAS, isActive: true },
      ]);
    });

    it('returns nothing for an empty list', async () => {
      await expect(catalog.findStates([])).resolves.toEqual([]);
    });
  });
});
