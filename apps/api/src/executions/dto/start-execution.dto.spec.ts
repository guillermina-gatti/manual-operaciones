import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StartExecutionDto } from './start-execution.dto';

const PROCEDURE = '1a000000-0000-4000-8000-000000000001';

// Same options as the global ValidationPipe (whitelist, forbidNonWhitelisted, transform).
async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(StartExecutionDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, failed: errors.map((error) => error.property) };
}

describe('StartExecutionDto', () => {
  it('accepts a UUID procedureId', async () => {
    const { dto, failed } = await check({ procedureId: PROCEDURE });

    expect(failed).toEqual([]);
    expect(dto.procedureId).toBe(PROCEDURE);
  });

  it.each([
    ['missing', {}],
    ['empty', { procedureId: '' }],
    ['not a UUID', { procedureId: 'cierre-de-caja' }],
    ['a number', { procedureId: 42 }],
    ['an array of UUIDs', { procedureId: [PROCEDURE] }],
  ])('rejects procedureId when it is %s', async (_case, plain) => {
    const { failed } = await check(plain);

    expect(failed).toEqual(['procedureId']);
  });

  it('rejects unknown properties, such as a userId', async () => {
    const { failed } = await check({
      procedureId: PROCEDURE,
      userId: '0b000000-0000-4000-8000-000000000003',
    });

    expect(failed).toEqual(['userId']);
  });
});
