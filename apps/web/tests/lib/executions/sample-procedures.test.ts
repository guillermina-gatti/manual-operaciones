import { describe, expect, test } from 'vitest';
import { procedureName } from '@/lib/executions/sample-procedures';

const CIERRE = '1a000000-0000-4000-8000-000000000001';
const UNKNOWN = '5d2f6a10-8c3e-4f3a-9c2b-4f3a9c2b81de';

describe('procedureName', () => {
  test('the title of the API wins, trimmed', () => {
    expect(procedureName(UNKNOWN, '  Arqueo de caja ')).toBe('Arqueo de caja');
  });

  test('without a title, the name of the sample procedure', () => {
    expect(procedureName(CIERRE)).toBe('Cierre de caja');
    expect(procedureName(CIERRE, '   ')).toBe('Cierre de caja');
  });

  test('neither: "Procedimiento"', () => {
    expect(procedureName(UNKNOWN, null)).toBe('Procedimiento');
  });
});
