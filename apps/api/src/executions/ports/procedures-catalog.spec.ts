import { CatalogUnavailableError } from './procedures-catalog';

describe('CatalogUnavailableError', () => {
  it('keeps its name, message and cause', () => {
    const cause = new Error('connection refused');
    const error = new CatalogUnavailableError('catalog is down', { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CatalogUnavailableError');
    expect(error.message).toBe('catalog is down');
    expect(error.cause).toBe(cause);
  });
});
