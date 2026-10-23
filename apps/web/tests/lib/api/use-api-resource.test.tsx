import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ApiError, useApiResource } from '@/lib/api';

// Un pedido que el test resuelve o rechaza cuando quiere, para controlar el orden de las respuestas.
interface Pending<T> {
  signal: AbortSignal;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function controlledFetcher<T>() {
  const calls: Pending<T>[] = [];
  const fetcher = vi.fn(
    (signal: AbortSignal) =>
      new Promise<T>((resolve, reject) => {
        calls.push({ signal, resolve, reject });
      }),
  );
  return { fetcher, calls };
}

describe('estados', () => {
  test('empieza en loading y pasa a success con los datos', async () => {
    const { fetcher, calls } = controlledFetcher<string>();
    const { result } = renderHook(() => useApiResource('documents?page=1', fetcher));

    expect(result.current).toMatchObject({ status: 'loading', data: undefined, error: null });

    await act(async () => calls[0].resolve('página 1'));

    expect(result.current).toMatchObject({ status: 'success', data: 'página 1', error: null });
  });

  test('un ApiError pasa a error', async () => {
    const { fetcher, calls } = controlledFetcher<string>();
    const { result } = renderHook(() => useApiResource('documents/abc', fetcher));
    const apiError = new ApiError(404, ['Not Found']);

    await act(async () => calls[0].reject(apiError));

    expect(result.current).toMatchObject({ status: 'error', data: undefined, error: apiError });
  });

  test('con clave null no pide nada y queda en idle', () => {
    const { fetcher } = controlledFetcher<string>();
    const { result } = renderHook(() => useApiResource(null, fetcher));

    expect(result.current.status).toBe('idle');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('reintentar', () => {
  test('reload vuelve a pedir, pasa por loading y muestra los datos nuevos', async () => {
    const { fetcher, calls } = controlledFetcher<string>();
    const { result } = renderHook(() => useApiResource('documents?page=1', fetcher));
    await act(async () => calls[0].reject(new ApiError(503)));
    expect(result.current.status).toBe('error');

    act(() => result.current.reload());

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('loading');

    await act(async () => calls[1].resolve('página 1'));

    expect(result.current).toMatchObject({ status: 'success', data: 'página 1' });
  });
});

describe('la respuesta vieja nunca pisa a la nueva', () => {
  test('si la clave cambia antes de la primera respuesta, solo queda la segunda', async () => {
    const { fetcher, calls } = controlledFetcher<string>();
    const { result, rerender } = renderHook(({ key }) => useApiResource(key, fetcher), {
      initialProps: { key: 'documents?page=1' },
    });

    rerender({ key: 'documents?page=2' });
    await act(async () => calls[1].resolve('página 2'));
    // La de la página 1 llega tarde, después de la de la página 2.
    await act(async () => calls[0].resolve('página 1'));

    expect(result.current).toMatchObject({ status: 'success', data: 'página 2' });
  });

  test('si la respuesta vieja llega mientras la nueva está pendiente, sigue en loading', async () => {
    const { fetcher, calls } = controlledFetcher<string>();
    const { result, rerender } = renderHook(({ key }) => useApiResource(key, fetcher), {
      initialProps: { key: 'documents?page=1' },
    });

    rerender({ key: 'documents?page=2' });
    await act(async () => calls[0].resolve('página 1'));

    expect(result.current).toMatchObject({ status: 'loading', data: undefined });

    await act(async () => calls[1].resolve('página 2'));

    expect(result.current).toMatchObject({ status: 'success', data: 'página 2' });
  });

  test('un error de la respuesta vieja tampoco pisa a la nueva', async () => {
    const { fetcher, calls } = controlledFetcher<string>();
    const { result, rerender } = renderHook(({ key }) => useApiResource(key, fetcher), {
      initialProps: { key: 'documents?page=1' },
    });

    rerender({ key: 'documents?page=2' });
    await act(async () => calls[1].resolve('página 2'));
    await act(async () => calls[0].reject(new ApiError(503)));

    expect(result.current).toMatchObject({ status: 'success', data: 'página 2', error: null });
  });

  test('al volver a una clave anterior, una respuesta vieja de esa clave no se usa', async () => {
    const { fetcher, calls } = controlledFetcher<string>();
    const { result, rerender } = renderHook(({ key }) => useApiResource(key, fetcher), {
      initialProps: { key: 'documents?page=1' },
    });

    rerender({ key: 'documents?page=2' });
    rerender({ key: 'documents?page=1' });
    // Llega la respuesta del primer pedido de la página 1, que ya se había abandonado.
    await act(async () => calls[0].resolve('página 1 vieja'));

    expect(result.current.status).toBe('loading');

    await act(async () => calls[2].resolve('página 1 nueva'));

    expect(result.current).toMatchObject({ status: 'success', data: 'página 1 nueva' });
  });

  test('cancela el pedido viejo al cambiar de clave', () => {
    const { fetcher, calls } = controlledFetcher<string>();
    const { rerender } = renderHook(({ key }) => useApiResource(key, fetcher), {
      initialProps: { key: 'documents?page=1' },
    });

    rerender({ key: 'documents?page=2' });

    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].signal.aborted).toBe(false);
  });

  test('cancela el pedido al desmontar la pantalla', () => {
    const { fetcher, calls } = controlledFetcher<string>();
    const { unmount } = renderHook(() => useApiResource('documents?page=1', fetcher));

    unmount();

    expect(calls[0].signal.aborted).toBe(true);
  });
});

describe('cuándo vuelve a pedir', () => {
  test('no vuelve a pedir si solo cambia la función (escrita en línea en cada render)', () => {
    const { result, rerender } = renderHook(() =>
      useApiResource('documents?page=1', () => new Promise<string>(() => {})),
    );

    rerender();
    rerender();

    expect(result.current.status).toBe('loading');
  });

  test('usa la versión más nueva de la función al volver a pedir', async () => {
    const first = vi.fn(() => Promise.resolve('primera'));
    const second = vi.fn(() => Promise.resolve('segunda'));
    const { result, rerender } = renderHook(({ fetcher }) => useApiResource('k', fetcher), {
      initialProps: { fetcher: first },
    });
    await act(async () => {});

    rerender({ fetcher: second });
    await act(async () => result.current.reload());

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe('segunda');
  });
});
