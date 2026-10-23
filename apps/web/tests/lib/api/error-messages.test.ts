import { describe, expect, test } from 'vitest';
import { ApiError, describeApiError } from '@/lib/api';
import type { ErrorContext } from '@/lib/api';

const CONTEXTS: ErrorContext[] = ['list', 'detail', 'download', 'upload'];

// Textos reales de la API (class-validator y DocumentUploadService), para comprobar que nunca se muestran.
const API_TEXTS = [
  'title must be shorter than or equal to 200 characters',
  'ownerId must be a UUID',
  'ownerId: el responsable no existe',
  'ownerId: el responsable no comparte ningún área con el documento',
  'areaIds: no existen las áreas 0a000000-0000-4000-8000-000000000009',
  'reviewDate tiene que ser posterior a hoy (2026-10-23)',
  'description must be shorter than or equal to 1000 characters',
  'Falta el archivo o está vacío',
  'Solo se aceptan archivos PDF, .txt o .md',
  'property foo should not exist',
  'Unauthorized',
  'Forbidden resource',
  'Not Found',
  'Ya hay un documento vigente con el mismo archivo',
  'File too large',
  'Service Unavailable',
  'Internal server error',
];

describe('400 en la carga: cada error va junto a su campo', () => {
  test.each([
    ['title must be shorter than or equal to 200 characters', 'title'],
    ['ownerId: el responsable no existe', 'ownerId'],
    ['ownerId: el responsable no comparte ningún área con el documento', 'ownerId'],
    ['areaIds: no existen las áreas 0a000000-0000-4000-8000-000000000009', 'areaIds'],
    ['reviewDate tiene que ser posterior a hoy (2026-10-23)', 'reviewDate'],
    ['description must be shorter than or equal to 1000 characters', 'description'],
    ['Falta el archivo o está vacío', 'file'],
  ])('"%s" → campo %s', (apiText, field) => {
    const result = describeApiError(new ApiError(400, [apiText]), 'upload');

    expect(Object.keys(result.fieldErrors)).toEqual([field]);
    expect(result.message).toBe('Revisá los datos marcados en el formulario.');
  });

  test('varios textos marcan varios campos', () => {
    const result = describeApiError(
      new ApiError(400, ['title must be longer than or equal to 1 characters', 'ownerId must be a UUID']),
      'upload',
    );

    expect(Object.keys(result.fieldErrors).sort()).toEqual(['ownerId', 'title']);
  });

  test('un texto sin campo va al aviso general', () => {
    const result = describeApiError(
      new ApiError(400, ['property foo should not exist']),
      'upload',
    );

    expect(result.fieldErrors).toEqual({});
    expect(result.message).toBe('Revisá los datos del formulario.');
  });
});

describe('un mensaje por código', () => {
  test('401: la sesión no es válida', () => {
    for (const context of CONTEXTS) {
      expect(describeApiError(new ApiError(401, ['Unauthorized']), context).message).toBe(
        'Tu sesión no es válida. Volvé a ingresar.',
      );
    }
  });

  test('403 en la carga: sin permiso para cargar', () => {
    const result = describeApiError(new ApiError(403, ['Forbidden resource']), 'upload');

    expect(result.message).toBe('No tenés permiso para cargar documentos.');
    expect(result.canRetry).toBe(false);
  });

  test('404 en el detalle y en la descarga: el mismo texto (F9)', () => {
    for (const context of ['detail', 'download'] as const) {
      const result = describeApiError(new ApiError(404, ['Not Found']), context);
      expect(result.message).toBe('No se encontró el documento.');
      expect(result.canRetry).toBe(false);
    }
  });

  test('400 en el detalle y en la descarga (id que no es UUID): igual que el 404 (F9)', () => {
    for (const context of ['detail', 'download'] as const) {
      expect(
        describeApiError(new ApiError(400, ['Validation failed (uuid is expected)']), context)
          .message,
      ).toBe('No se encontró el documento.');
    }
  });

  test('409: mensaje y existingDocumentId para el enlace', () => {
    const result = describeApiError(
      new ApiError(
        409,
        ['Ya hay un documento vigente con el mismo archivo'],
        '11111111-1111-4111-8111-111111111111',
      ),
      'upload',
    );

    expect(result.message).toBe('Ya existe un documento con este mismo archivo.');
    expect(result.existingDocumentId).toBe('11111111-1111-4111-8111-111111111111');
  });

  test('413: error en el campo del archivo', () => {
    const result = describeApiError(new ApiError(413, ['File too large']), 'upload');

    expect(result.fieldErrors).toEqual({ file: 'El archivo pesa más de 10 MB.' });
  });

  test('415: error en el campo del archivo', () => {
    const result = describeApiError(
      new ApiError(415, ['Solo se aceptan archivos PDF, .txt o .md']),
      'upload',
    );

    expect(result.fieldErrors).toEqual({
      file: 'El archivo no es un PDF, .txt o .md válido.',
    });
  });

  test('503: probá de nuevo en unos minutos, con reintentar', () => {
    for (const context of CONTEXTS) {
      const result = describeApiError(new ApiError(503, ['Service Unavailable']), context);
      expect(result.message).toBe(
        'El servicio no está disponible. Probá de nuevo en unos minutos.',
      );
      expect(result.canRetry).toBe(true);
    }
  });

  test('500 y códigos desconocidos: error inesperado, con reintentar', () => {
    for (const status of [500, 418]) {
      const result = describeApiError(new ApiError(status, ['Internal server error']), 'list');
      expect(result.message).toBe('Ocurrió un error inesperado. Probá de nuevo.');
      expect(result.canRetry).toBe(true);
    }
  });

  test('status 0: sin conexión, con reintentar', () => {
    const result = describeApiError(new ApiError(0), 'list');

    expect(result.message).toBe(
      'No pudimos conectarnos con el servidor. Revisá tu conexión y probá de nuevo.',
    );
    expect(result.canRetry).toBe(true);
  });

  test('un error que no es ApiError: error inesperado', () => {
    expect(describeApiError(new TypeError('x is undefined'), 'list').message).toBe(
      'Ocurrió un error inesperado. Probá de nuevo.',
    );
  });
});

describe('nunca se muestra el texto técnico de la API', () => {
  test.each([0, 400, 401, 403, 404, 409, 413, 415, 500, 503])('código %i', (status) => {
    for (const context of CONTEXTS) {
      const result = describeApiError(new ApiError(status, API_TEXTS), context);
      const shown = [result.message, ...Object.values(result.fieldErrors)].join('\n');

      for (const apiText of API_TEXTS) {
        expect(shown).not.toContain(apiText);
      }
      expect(shown).not.toMatch(/\b(must|should|property|Unauthorized|Forbidden|Not Found|ownerId|areaIds|reviewDate)\b/);
    }
  });
});
