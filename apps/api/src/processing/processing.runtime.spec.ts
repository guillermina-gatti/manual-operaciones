import { EventEmitter } from 'node:events';
import {
  attachQueueListeners,
  attachWorkerListeners,
  sanitizeBullMqError,
} from './processing-runtime-listeners';

describe('processing-runtime-listeners', () => {
  it('sanitizeBullMqError oculta mensajes con credenciales y preserva códigos seguros', () => {
    const err = Object.assign(
      new Error('connect ECONNREFUSED redis://:supersecreto@redis:6379'),
      { code: 'ECONNREFUSED' },
    );

    const sanitized = sanitizeBullMqError(err);

    expect(sanitized).toEqual({ errorType: 'Error', errorCode: 'ECONNREFUSED' });
    expect(JSON.stringify(sanitized)).not.toContain('supersecreto');
    expect(JSON.stringify(sanitized)).not.toContain('redis://');
  });

  it('sanitizeBullMqError reemplaza códigos no seguros o desconocidos por BULLMQ_ERROR', () => {
    const err = Object.assign(new TypeError('postgres://user:pass@rds:5432'), {
      code: 'unsafe-code-with-secret',
    });

    expect(sanitizeBullMqError(err)).toEqual({
      errorType: 'TypeError',
      errorCode: 'BULLMQ_ERROR',
    });
  });

  it('queue.on("error") registra error sanitizado sin lanzar excepción no controlada', () => {
    const queue = new EventEmitter();
    const logger = { warn: jest.fn(), error: jest.fn() };
    attachQueueListeners(queue, logger);

    const err = Object.assign(new Error('redis://:clave@redis:6379'), {
      code: 'ETIMEDOUT',
    });
    expect(() => queue.emit('error', err)).not.toThrow();

    expect(logger.error).toHaveBeenCalledTimes(1);
    const payload = logger.error.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.component).toBe('ProcessingQueueClient');
    expect(payload.errorCode).toBe('ETIMEDOUT');
    expect(JSON.stringify(payload)).not.toContain('clave');
  });

  it('worker.on("error"), failed y stalled registran eventos sanitizados', () => {
    const worker = new EventEmitter();
    const logger = { warn: jest.fn(), error: jest.fn() };
    attachWorkerListeners(worker, logger);

    worker.emit(
      'error',
      Object.assign(new Error('JWT_SECRET=abc redis://:pass@host'), {
        code: 'ECONNRESET',
      }),
    );
    worker.emit(
      'failed',
      { data: { documentVersionId: 'ver-1' }, attemptsMade: 2 },
      new Error('secret-token-leak'),
    );
    worker.emit('stalled', 'ver-2');

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        component: 'ProcessingWorker',
        errorCode: 'ECONNRESET',
      }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        component: 'ProcessingWorker',
        documentVersionId: 'ver-1',
        attemptsMade: 2,
        errorCode: 'BULLMQ_ERROR',
      }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        component: 'ProcessingWorker',
        jobId: 'ver-2',
      }),
    );
    const serialized = JSON.stringify([logger.error.mock.calls, logger.warn.mock.calls]);
    expect(serialized).not.toContain('pass');
    expect(serialized).not.toContain('JWT_SECRET');
    expect(serialized).not.toContain('secret-token-leak');
  });

  it('registra exactamente un listener por evento en Queue y Worker', () => {
    const queue = new EventEmitter();
    const worker = new EventEmitter();
    const logger = { warn: jest.fn(), error: jest.fn() };

    attachQueueListeners(queue, logger);
    attachWorkerListeners(worker, logger);

    expect(queue.listenerCount('error')).toBe(1);
    expect(worker.listenerCount('error')).toBe(1);
    expect(worker.listenerCount('failed')).toBe(1);
    expect(worker.listenerCount('stalled')).toBe(1);
  });
});
