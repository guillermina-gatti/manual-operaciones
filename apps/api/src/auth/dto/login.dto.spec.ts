import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

const validPayload = {
  email: 'usuario@empresa.com',
  password: 'MiPasswordSegura123!',
};

async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(LoginDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return {
    dto,
    failed: errors.map((error) => error.property),
    errors,
  };
}

describe('LoginDto', () => {
  it('acepta credenciales con formato válido', async () => {
    const { dto, failed } = await check(validPayload);

    expect(failed).toEqual([]);
    expect(dto.email).toBe(validPayload.email);
    expect(dto.password).toBe(validPayload.password);
  });

  describe('email', () => {
    it('falla si falta el campo email', async () => {
      const { email: _omitted, ...withoutEmail } = validPayload;
      const { failed } = await check(withoutEmail);

      expect(failed).toEqual(['email']);
    });

    it('falla si el email está vacío', async () => {
      const { failed } = await check({ ...validPayload, email: '' });

      expect(failed).toEqual(['email']);
    });

    it('falla si el formato de correo no es válido', async () => {
      const { failed } = await check({
        ...validPayload,
        email: 'correo-invalido-sin-arroba',
      });

      expect(failed).toEqual(['email']);
    });

    it('falla si el email no es una cadena de texto', async () => {
      const { failed } = await check({ ...validPayload, email: 12345 });

      expect(failed).toEqual(['email']);
    });
  });

  describe('password', () => {
    it('falla si falta el campo password', async () => {
      const { password: _omitted, ...withoutPassword } = validPayload;
      const { failed } = await check(withoutPassword);

      expect(failed).toEqual(['password']);
    });

    it('falla si la contraseña está vacía', async () => {
      const { failed } = await check({ ...validPayload, password: '' });

      expect(failed).toEqual(['password']);
    });

    it('falla si la contraseña no es una cadena de texto', async () => {
      const { failed } = await check({ ...validPayload, password: 987654 });

      expect(failed).toEqual(['password']);
    });
  });

  it('rechaza propiedades adicionales no permitidas', async () => {
    const { failed } = await check({
      ...validPayload,
      role: 'ADMIN',
    });

    expect(failed).toEqual(['role']);
  });
});
