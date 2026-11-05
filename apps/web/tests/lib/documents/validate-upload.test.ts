import { afterEach, describe, expect, test, vi } from 'vitest';
import { tomorrowIn } from '@/lib/documents/review-date';
import { MAX_FILE_SIZE_BYTES } from '@/lib/documents/upload-rules';
import { validateFile, validateUpload } from '@/lib/documents/validate-upload';
import type { UploadFormValues } from '@/lib/documents/validate-upload';

const BUENOS_AIRES = 'America/Argentina/Buenos_Aires';
const MB = 1024 * 1024;

// 23/10/2026 a las 12:00 en Buenos Aires: mañana es el 24/10.
const NOW = new Date('2026-10-23T15:00:00.000Z');

const fileOf = (name: string, bytes = 10) => new File([new Uint8Array(bytes)], name);

const VALID: UploadFormValues = {
  file: fileOf('manual.pdf', 2 * MB),
  title: 'Manual de caja',
  areaIds: ['0a000000-0000-4000-8000-000000000001'],
  ownerId: '0b000000-0000-4000-8000-000000000002',
  reviewDate: '2026-10-24',
  description: '',
};

const errorsOf = (changes: Partial<UploadFormValues>) =>
  validateUpload({ ...VALID, ...changes }, NOW);

afterEach(() => {
  vi.unstubAllEnvs();
});

test('con todos los datos válidos no hay errores', () => {
  expect(validateUpload(VALID, NOW)).toEqual({});
});

describe('archivo', () => {
  test('E5: un .docx da error en file', () => {
    expect(errorsOf({ file: fileOf('manual.docx') })).toEqual({
      file: 'El archivo tiene que ser PDF, .txt o .md.',
    });
  });

  test('E5: un archivo de 11 MB da error en file', () => {
    expect(errorsOf({ file: fileOf('manual.pdf', 11 * MB) })).toEqual({
      file: 'El archivo pesa más de 10 MB.',
    });
  });

  test('exactamente 10 MB pasa; un byte más no', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(10 * MB);
    expect(errorsOf({ file: fileOf('manual.pdf', 10 * MB) })).toEqual({});
    expect(errorsOf({ file: fileOf('manual.pdf', 10 * MB + 1) })).toHaveProperty('file');
  });

  test('un archivo de 0 bytes da error', () => {
    expect(errorsOf({ file: fileOf('manual.pdf', 0) })).toEqual({
      file: 'El archivo está vacío.',
    });
  });

  test('sin archivo da error', () => {
    expect(errorsOf({ file: null })).toEqual({ file: 'Elegí un archivo.' });
  });

  test.each(['manual.pdf', 'MANUAL.PDF', 'notas.txt', 'guía.md', 'copia.final.Md'])(
    '%s pasa',
    (name) => {
      expect(validateFile(fileOf(name))).toBeUndefined();
    },
  );

  // Igual que extname de Node, que usa la API: un nombre que es solo ".pdf" no tiene extensión.
  test.each(['manual', 'manual.', '.pdf', 'manual.pdf.exe', 'manual.doc'])('%s no pasa', (name) => {
    expect(validateFile(fileOf(name))).toBe('El archivo tiene que ser PDF, .txt o .md.');
  });
});

describe('título', () => {
  test.each(['', '   '])('%j da error', (title) => {
    expect(errorsOf({ title })).toEqual({ title: 'Escribí un título.' });
  });

  test('de 200 caracteres pasa; de 201 no', () => {
    expect(errorsOf({ title: 'a'.repeat(200) })).toEqual({});
    expect(errorsOf({ title: 'a'.repeat(201) })).toEqual({
      title: 'El título puede tener hasta 200 caracteres.',
    });
  });

  test('los espacios del principio y del final no cuentan, como en la API', () => {
    expect(errorsOf({ title: `  ${'a'.repeat(200)}  ` })).toEqual({});
  });
});

describe('áreas, responsable y descripción', () => {
  test('sin áreas da error', () => {
    expect(errorsOf({ areaIds: [] })).toEqual({ areaIds: 'Elegí al menos un área.' });
  });

  test('sin responsable da error', () => {
    expect(errorsOf({ ownerId: '' })).toEqual({ ownerId: 'Elegí un responsable.' });
  });

  test('descripción de 1000 caracteres pasa; de 1001 no', () => {
    expect(errorsOf({ description: 'a'.repeat(1000) })).toEqual({});
    expect(errorsOf({ description: 'a'.repeat(1001) })).toEqual({
      description: 'La descripción puede tener hasta 1000 caracteres.',
    });
  });
});

describe('fecha de revisión (D1 del plan 001: desde mañana en Buenos Aires)', () => {
  test('la fecha de hoy da error y la de mañana pasa', () => {
    expect(errorsOf({ reviewDate: '2026-10-23' })).toEqual({
      reviewDate: 'La fecha de revisión tiene que ser a partir de mañana.',
    });
    expect(errorsOf({ reviewDate: '2026-10-24' })).toEqual({});
  });

  test('una fecha pasada da error', () => {
    expect(errorsOf({ reviewDate: '2025-01-01' })).toHaveProperty('reviewDate');
  });

  test('sin fecha da error', () => {
    expect(errorsOf({ reviewDate: '' })).toEqual({ reviewDate: 'Elegí la fecha de revisión.' });
  });

  test.each(['2027-02-30', '2027-13-01', '24/10/2026', '2026-10-24T00:00'])(
    '%s no es una fecha válida',
    (reviewDate) => {
      expect(errorsOf({ reviewDate })).toEqual({
        reviewDate: 'La fecha de revisión no es válida.',
      });
    },
  );
});

describe('tomorrowIn', () => {
  test('a las 23:59 de Buenos Aires, mañana es el día siguiente, aunque en UTC ya sea otro día', () => {
    // 23/10 23:59 en Buenos Aires = 24/10 02:59 en UTC.
    const now = new Date('2026-10-24T02:59:00.000Z');

    expect(tomorrowIn(BUENOS_AIRES, now)).toBe('2026-10-24');
    expect(tomorrowIn('UTC', now)).toBe('2026-10-25');
  });

  test('a las 00:00 de Buenos Aires ya es el día nuevo', () => {
    // 24/10 00:00 en Buenos Aires = 24/10 03:00 en UTC.
    expect(tomorrowIn(BUENOS_AIRES, new Date('2026-10-24T03:00:00.000Z'))).toBe('2026-10-25');
  });

  test('cambia de mes y de año', () => {
    expect(tomorrowIn(BUENOS_AIRES, new Date('2026-12-31T15:00:00.000Z'))).toBe('2027-01-01');
    expect(tomorrowIn(BUENOS_AIRES, new Date('2027-02-28T15:00:00.000Z'))).toBe('2027-03-01');
  });

  test('no depende de la zona horaria del proceso', () => {
    vi.stubEnv('TZ', 'Asia/Tokyo');

    expect(tomorrowIn(BUENOS_AIRES, new Date('2026-10-24T02:59:00.000Z'))).toBe('2026-10-24');
  });

  test('validateUpload usa mañana en Buenos Aires: a las 23:59 de allá, el día siguiente pasa', () => {
    const now = new Date('2026-10-24T02:59:00.000Z');

    expect(validateUpload({ ...VALID, reviewDate: '2026-10-24' }, now)).toEqual({});
    expect(validateUpload({ ...VALID, reviewDate: '2026-10-23' }, now)).toHaveProperty('reviewDate');
  });
});

test('marca todos los campos con error a la vez', () => {
  const errors = validateUpload(
    { file: null, title: '', areaIds: [], ownerId: '', reviewDate: '', description: '' },
    NOW,
  );

  expect(Object.keys(errors).sort()).toEqual(['areaIds', 'file', 'ownerId', 'reviewDate', 'title']);
});
