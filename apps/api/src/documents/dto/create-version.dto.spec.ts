import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVersionDto } from './create-version.dto';

// Las mismas opciones que el ValidationPipe global (whitelist, forbidNonWhitelisted, transform).
async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateVersionDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, failed: errors.map((error) => error.property) };
}

describe('CreateVersionDto (spec 003, R7b)', () => {
  it('acepta que no venga la fecha de revisión', async () => {
    const { dto, failed } = await check({});

    expect(failed).toEqual([]);
    expect(dto.reviewDate).toBeUndefined();
  });

  it('acepta una fecha YYYY-MM-DD', async () => {
    await expect(check({ reviewDate: '2027-03-01' })).resolves.toMatchObject({
      failed: [],
    });
  });

  it('falla sin los ceros a la izquierda', async () => {
    const { failed } = await check({ reviewDate: '2027-3-1' });

    expect(failed).toEqual(['reviewDate']);
  });

  it('falla con una fecha que no existe', async () => {
    const { failed } = await check({ reviewDate: '2027-02-30' });

    expect(failed).toEqual(['reviewDate']);
  });

  it('rechaza los campos de más', async () => {
    const { failed } = await check({ title: 'Otro' });

    expect(failed).toEqual(['title']);
  });
});
