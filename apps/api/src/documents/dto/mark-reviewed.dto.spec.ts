import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MarkReviewedDto } from './mark-reviewed.dto';

// Las mismas opciones que el ValidationPipe global (whitelist, forbidNonWhitelisted, transform).
async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(MarkReviewedDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, failed: errors.map((error) => error.property) };
}

describe('MarkReviewedDto (spec 005, R7)', () => {
  it('acepta una fecha YYYY-MM-DD', async () => {
    const { dto, failed } = await check({ reviewDate: '2026-11-10' });

    expect(failed).toEqual([]);
    expect(dto.reviewDate).toBe('2026-11-10');
  });

  it('la fecha es obligatoria', async () => {
    await expect(check({})).resolves.toMatchObject({
      failed: ['reviewDate'],
    });
  });

  it.each(['2026-11-31', '09/11/2026', '2026-11-09T00:00', '2026-1-9', ''])(
    'falla con %p',
    async (reviewDate) => {
      await expect(check({ reviewDate })).resolves.toMatchObject({
        failed: ['reviewDate'],
      });
    },
  );

  it('los mensajes empiezan con el nombre del campo, para que la web los ubique', async () => {
    const dto = plainToInstance(MarkReviewedDto, { reviewDate: '09/11/2026' });
    const [error] = await validate(dto);

    expect(Object.values(error.constraints ?? {})).toContainEqual(
      'reviewDate tiene que tener el formato YYYY-MM-DD',
    );
  });

  it('rechaza campos de más (no se edita nada más desde acá, sección 4 de la spec)', async () => {
    await expect(
      check({ reviewDate: '2026-11-10', title: 'Otro título' }),
    ).resolves.toMatchObject({ failed: ['title'] });
  });
});
