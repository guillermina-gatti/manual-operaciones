import { detail } from '../../../test/procedures/version-fixtures';
import { toVersionDetailResponse } from './version-detail.response';

describe('toVersionDetailResponse (spec 015, R9)', () => {
  it('adds the description and the steps in order, with only their four fields', () => {
    const version = detail({
      status: 'SUPERSEDED',
      description: 'Al final del turno',
      steps: [
        // A step key would be internal: it must not leave.
        { id: 's1', order: 1, title: 'Contar', description: '', stepKey: 'k1' } as never,
        { id: 's2', order: 2, title: 'Comparar', description: 'Con el reporte' },
      ],
    });

    const response = toVersionDetailResponse({ ...version, publishedByName: null });

    expect(response.description).toBe('Al final del turno');
    expect(response.steps).toEqual([
      { id: 's1', order: 1, title: 'Contar', description: '' },
      { id: 's2', order: 2, title: 'Comparar', description: 'Con el reporte' },
    ]);
  });
});
