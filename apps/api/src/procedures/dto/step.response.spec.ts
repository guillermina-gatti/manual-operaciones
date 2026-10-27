import { toStepResponse } from './step.response';

describe('toStepResponse', () => {
  it('D10: maps field by field and does not pass on anything else the record has', () => {
    const record = {
      id: '1c000000-0000-4000-8000-000000000001',
      procedureVersionId: '1b000000-0000-4000-8000-000000000001',
      order: 2,
      title: 'Contar el efectivo',
      description: '',
      internal: 'must not leave',
    };

    expect(toStepResponse(record)).toEqual({
      id: '1c000000-0000-4000-8000-000000000001',
      procedureVersionId: '1b000000-0000-4000-8000-000000000001',
      order: 2,
      title: 'Contar el efectivo',
      description: '',
    });
  });
});
