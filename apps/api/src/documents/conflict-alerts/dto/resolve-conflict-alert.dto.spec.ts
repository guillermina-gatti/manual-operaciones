/* Spec 011 (T08, R15): el cuerpo de POST /conflict-alerts/:id/resolve */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResolveConflictAlertDto } from './resolve-conflict-alert.dto';

const errorsOf = async (body: Record<string, unknown>) =>
  (
    await validate(plainToInstance(ResolveConflictAlertDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  ).map((error) => error.property);

describe('ResolveConflictAlertDto (R15)', () => {
  it('la nota es opcional', async () => {
    expect(await errorsOf({})).toEqual([]);
  });

  it('acepta una nota de hasta 500 caracteres', async () => {
    expect(await errorsOf({ note: 'a'.repeat(500) })).toEqual([]);
  });

  it.each([
    [{ note: 'a'.repeat(501) }, 'note'],
    [{ note: 42 }, 'note'],
    [{ status: 'RESOLVED' }, 'status'],
  ])('rechaza %j', async (body, property) => {
    expect(await errorsOf(body)).toEqual([property]);
  });
});
