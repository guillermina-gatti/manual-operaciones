/* The real JwtAuthGuard for the executions controller specs: real JWTs, users from a fake database */

import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser } from '../../src/common/auth';
import { FIXTURE_USERS } from '../../src/documents/adapters/fixtures';
import type { DirectoryUser } from '../../src/documents/ports/users-directory';
import { PrismaService } from '../../src/prisma/prisma.service';

// Only for these specs; the e2e use the JWT_SECRET of the environment.
const SPEC_JWT_SECRET = 'executions-controller-spec-secret';
const ACCESS_TOKEN_TTL_SECONDS = 900;

const jwt = new JwtService();

const profile = (
  user: DirectoryUser,
  name: string,
  email: string,
): AuthUser => ({
  id: user.id,
  email,
  name,
  role: user.role,
  areaIds: [...user.areaIds],
});

// What the guard puts in request.user for each one, so the specs can expect it as is.
export const SPEC_USERS = {
  admin: profile(
    FIXTURE_USERS.admin,
    'Ana Administradora',
    'admin@fixtures.test',
  ),
  supervisorVentas: profile(
    FIXTURE_USERS.supervisorVentas,
    'Sergio Supervisor de Ventas',
    'supervisorventas@fixtures.test',
  ),
  empleadoVentas: profile(
    FIXTURE_USERS.empleadoVentas,
    'Elena Empleada de Ventas',
    'empleadoventas@fixtures.test',
  ),
} satisfies Record<string, AuthUser>;

// What JwtAuthGuard injects. The users table answers with SPEC_USERS, as the guard
// reads it (role, isActive and active areas). A plain function and not jest.fn, so the
// specs can reset their mocks without losing it.
export function realAuthProviders(): Provider[] {
  const users = new Map<string, AuthUser>(
    Object.values(SPEC_USERS).map((user) => [user.id, user]),
  );
  const prisma = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) => {
        const user = users.get(where.id);
        return Promise.resolve(
          user && {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            isActive: true,
            areas: user.areaIds.map((areaId) => ({ areaId })),
          },
        );
      },
    },
  };

  return [
    { provide: JwtService, useValue: jwt },
    {
      provide: ConfigService,
      useValue: {
        get: (key: string) =>
          key === 'JWT_SECRET' ? SPEC_JWT_SECRET : undefined,
      },
    },
    { provide: PrismaService, useValue: prisma },
  ];
}

// The header the login gives: only `sub` counts, the role is read from the users.
export const bearer = (user: Pick<AuthUser, 'id'>) => ({
  Authorization: `Bearer ${jwt.sign(
    { sub: user.id },
    { secret: SPEC_JWT_SECRET, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  )}`,
});
