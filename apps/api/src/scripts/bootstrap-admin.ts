import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PasswordService } from '../auth/password.service';
import { Prisma, PrismaClient, type Role } from '../generated/prisma/client';

export const MAX_SERIALIZATION_RETRIES = 3;
export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 100;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_EMAIL_LENGTH = 255;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface BootstrapAdminInput {
  email: string;
  name: string;
  password: string;
  confirmPassword: string;
}

export interface ValidatedBootstrapInput {
  email: string;
  name: string;
  password: string;
}

export interface CreatedAdminSummary {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
}

export class BootstrapAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapAdminError';
  }
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

/**
 * Valida y normaliza las entradas del bootstrap aplicando las mismas reglas
 * de formato y longitud que el registro habitual (HU29).
 */
export function validateBootstrapInput(
  input: BootstrapAdminInput,
): ValidatedBootstrapInput {
  if (typeof input.email !== 'string') {
    throw new BootstrapAdminError('El correo electrónico es requerido.');
  }
  const email = input.email.trim().toLowerCase();
  if (
    email.length === 0 ||
    email.length > MAX_EMAIL_LENGTH ||
    !EMAIL_REGEX.test(email)
  ) {
    throw new BootstrapAdminError('El correo electrónico no es válido.');
  }

  if (typeof input.name !== 'string') {
    throw new BootstrapAdminError('El nombre es requerido.');
  }
  const name = input.name.trim();
  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    throw new BootstrapAdminError(
      `El nombre debe tener entre ${MIN_NAME_LENGTH} y ${MAX_NAME_LENGTH} caracteres.`,
    );
  }

  if (typeof input.password !== 'string' || input.password.length === 0) {
    throw new BootstrapAdminError('La contraseña es requerida.');
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new BootstrapAdminError(
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  }
  if (input.password.length > MAX_PASSWORD_LENGTH) {
    throw new BootstrapAdminError(
      `La contraseña no puede exceder los ${MAX_PASSWORD_LENGTH} caracteres.`,
    );
  }

  if (input.password !== input.confirmPassword) {
    throw new BootstrapAdminError('Las contraseñas no coinciden.');
  }

  return { email, name, password: input.password };
}

/**
 * Crea el primer usuario ADMIN en una transacción Serializable.
 * Calcula el hash bcrypt fuera de la transacción y reintenta únicamente ante P2034.
 */
export async function bootstrapInitialAdmin(
  prisma: Pick<PrismaClient, '$transaction'>,
  passwordService: Pick<PasswordService, 'hash'>,
  input: BootstrapAdminInput,
): Promise<CreatedAdminSummary> {
  const validated = validateBootstrapInput(input);
  const passwordHash = await passwordService.hash(validated.password);

  for (let attempt = 0; attempt <= MAX_SERIALIZATION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const existingAdmins = await tx.user.count({
            where: { role: 'ADMIN' },
          });
          if (existingAdmins > 0) {
            throw new BootstrapAdminError(
              'Operación cancelada: ya existe al menos un usuario administrador en el sistema.',
            );
          }

          const existingEmail = await tx.user.findUnique({
            where: { email: validated.email },
            select: { id: true },
          });
          if (existingEmail) {
            throw new BootstrapAdminError(
              'Operación cancelada: ya existe un usuario registrado con ese correo electrónico.',
            );
          }

          return tx.user.create({
            data: {
              email: validated.email,
              name: validated.name,
              passwordHash,
              role: 'ADMIN',
              isActive: true,
            },
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              isActive: true,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof BootstrapAdminError) {
        throw error;
      }
      if (isPrismaErrorCode(error, 'P2034')) {
        if (attempt < MAX_SERIALIZATION_RETRIES) {
          continue;
        }
        throw new BootstrapAdminError(
          'Conflicto de concurrencia al crear el administrador tras múltiples reintentos.',
        );
      }
      if (isPrismaErrorCode(error, 'P2002')) {
        throw new BootstrapAdminError(
          'Operación cancelada: el correo electrónico ya se encuentra registrado.',
        );
      }
      throw new BootstrapAdminError(
        'No se pudo completar el bootstrap del administrador en la base de datos.',
      );
    }
  }

  throw new BootstrapAdminError(
    'No se pudo completar el bootstrap del administrador.',
  );
}

export function assertInteractiveEnvironment(
  argv: readonly string[] = process.argv,
  stdin: Pick<NodeJS.ReadStream, 'isTTY'> = process.stdin,
): void {
  if (argv.slice(2).length > 0) {
    throw new BootstrapAdminError(
      'Este comando no acepta credenciales ni parámetros por línea de comandos. Ejecutalo de forma interactiva.',
    );
  }

  if (stdin.isTTY !== true) {
    throw new BootstrapAdminError(
      'Se requiere una terminal interactiva (TTY) para ingresar credenciales de forma segura.',
    );
  }
}

function readHiddenPrompt(
  prompt: string,
  stdin: NodeJS.ReadStream = process.stdin,
  stdout: NodeJS.WriteStream = process.stdout,
): Promise<string> {
  return new Promise((resolve, reject) => {
    stdout.write(prompt);
    const chars: string[] = [];
    const wasRaw = stdin.isRaw;

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
    };

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdout.write('\n');
          cleanup();
          resolve(chars.join(''));
          return;
        }
        if (char === '\u0003') {
          stdout.write('\n');
          cleanup();
          reject(new BootstrapAdminError('Operación cancelada por el operador.'));
          return;
        }
        if (char === '\u007f' || char === '\b') {
          chars.pop();
          continue;
        }
        if (char >= ' ') {
          chars.push(char);
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function promptBootstrapInput(): Promise<BootstrapAdminInput> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let email: string;
  let name: string;
  try {
    process.stdout.write(
      '=== PispIAr: Bootstrap seguro del primer usuario ADMIN ===\n',
    );
    email = await rl.question('Correo electrónico: ');
    name = await rl.question('Nombre completo: ');
  } finally {
    rl.close();
  }

  const password = await readHiddenPrompt(
    'Contraseña (mínimo 8 caracteres, entrada oculta): ',
  );
  const confirmPassword = await readHiddenPrompt(
    'Confirmar contraseña (entrada oculta): ',
  );

  return { email, name, password, confirmPassword };
}

export async function main(): Promise<void> {
  let prisma: PrismaClient | undefined;

  try {
    assertInteractiveEnvironment();

    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new BootstrapAdminError(
        'Falta la variable de entorno DATABASE_URL.',
      );
    }

    const input = await promptBootstrapInput();
    validateBootstrapInput(input);

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    const passwordService = new PasswordService();

    const created = await bootstrapInitialAdmin(prisma, passwordService, input);
    process.stdout.write(
      `[OK] Administrador inicial creado: ${created.email} (rol=${created.role}, activo=${String(created.isActive)}).\n`,
    );
  } catch (error) {
    const message =
      error instanceof BootstrapAdminError
        ? error.message
        : 'Error inesperado durante el bootstrap del administrador.';
    process.stderr.write(`[ERROR] ${message}\n`);
    process.exitCode = 1;
  } finally {
    await prisma?.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
