import { assertDevelopmentDatabase } from './demo-guard';

const URL_LOCAL = 'postgresql://user:pass@localhost:5432/manual';

describe('assertDevelopmentDatabase', () => {
  it('returns the database name for a localhost URL', () => {
    expect(assertDevelopmentDatabase(URL_LOCAL, 'development')).toBe('manual');
  });

  it('refuses to run with NODE_ENV=production', () => {
    expect(() => assertDevelopmentDatabase(URL_LOCAL, 'production')).toThrow(
      /production/,
    );
  });

  it('refuses a missing DATABASE_URL', () => {
    expect(() => assertDevelopmentDatabase(undefined, 'development')).toThrow(
      /DATABASE_URL/,
    );
  });

  it('refuses a database that is not on localhost (AWS)', () => {
    const aws = 'postgresql://u:p@db.abc.rds.amazonaws.com:5432/manual';
    expect(() => assertDevelopmentDatabase(aws, 'development')).toThrow(
      /localhost/,
    );
  });
});
