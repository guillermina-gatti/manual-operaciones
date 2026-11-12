import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Role } from '../common/auth';
import type {
  InvitationListItemResponse,
  InvitationStatus,
} from './dto/invitation-list-item.response';
import {
  generateInvitationToken,
  hashInvitationToken,
  INVITATION_TOKEN_BASE64URL_REGEX,
} from '../auth/token.utils';

/**
 * Tiempo de validez estándar de una invitación: 48 horas (en milisegundos).
 */
export const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

export interface CreateInvitationParams {
  email: string;
  role: Role;
  areaIds: string[];
  createdById: string;
}

export interface CreateInvitationResult {
  invitation: {
    id: string;
    email: string;
    role: Role;
    expiresAt: Date;
    createdAt: Date;
    createdById: string;
    areaIds: string[];
  };
  rawToken: string;
}

export interface ValidatedInvitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
  areaIds: string[];
}

/**
 * Determina si un error de Prisma corresponde a la violación del índice único
 * parcial de invitaciones pendientes por correo electrónico.
 */
function isPendingInvitationUniqueViolation(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    const target = error.meta?.target;
    if (Array.isArray(target) && target.includes('email')) {
      return true;
    }
    if (
      typeof target === 'string' &&
      (target.includes('email') ||
        target.includes('user_invitations_one_pending_per_email_idx'))
    ) {
      return true;
    }
  }
  return false;
}

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea una nueva invitación de usuario con rol y áreas predeterminadas.
   *
   * Reglas de negocio y seguridad:
   * 1. Normaliza el correo electrónico eliminando espacios y convirtiendo a minúsculas.
   * 2. Comprueba que el correo no pertenezca a una cuenta de usuario ya registrada.
   * 3. Sanea y deduplica los identificadores de áreas provistos.
   * 4. Exige al menos un área válida para EMPLOYEE y SUPERVISOR; ADMIN puede no tener áreas.
   * 5. Verifica en base de datos que todas las áreas existan y se encuentren habilitadas (isActive: true).
   * 6. Si existe una invitación previa vigente (no aceptada, no revocada y expiresAt > now), rechaza con 409 Conflict.
   * 7. Si existe una invitación previa vencida (expiresAt <= now), la revoca atómicamente dentro de la transacción.
   * 8. Genera un token criptográficamente seguro de 256 bits, persistiendo únicamente su hash SHA-256.
   * 9. El token plano (rawToken) nunca se persiste ni se escribe en logs.
   */
  async createInvitation(
    params: CreateInvitationParams,
  ): Promise<CreateInvitationResult> {
    const { email, role, areaIds, createdById } = params;

    if (typeof email !== 'string' || !email.trim().includes('@')) {
      throw new BadRequestException('Correo electrónico inválido');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Saneamiento y deduplicación de IDs de áreas
    const uniqueAreaIds = [...new Set(areaIds ?? [])];

    // 2. Validación de asignación mínima de áreas según rol
    if (role !== 'ADMIN' && uniqueAreaIds.length === 0) {
      throw new BadRequestException('Se requiere al menos un área para este rol');
    }

    // 3. Validación de existencia y estado activo de las áreas solicitadas
    if (uniqueAreaIds.length > 0) {
      const areas = await this.prisma.area.findMany({
        where: { id: { in: uniqueAreaIds } },
        select: { id: true, isActive: true },
      });

      if (
        areas.length !== uniqueAreaIds.length ||
        areas.some((area) => !area.isActive)
      ) {
        throw new BadRequestException(
          'areaIds: alguna de las áreas es inexistente o inactiva',
        );
      }
    }

    // 4. Verificación de usuario existente con búsqueda insensible a mayúsculas
    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException(
        'El correo ya pertenece a un usuario registrado',
      );
    }

    // 5. Verificación de invitación pendiente preexistente
    const existingInvitation = await this.prisma.userInvitation.findFirst({
      where: {
        email: normalizedEmail,
        acceptedAt: null,
        revokedAt: null,
      },
    });

    const now = new Date();
    if (existingInvitation) {
      if (existingInvitation.expiresAt > now) {
        throw new ConflictException(
          'Ya existe una invitación pendiente y vigente para este correo electrónico',
        );
      }
    }

    // 6. Generación de credenciales seguras
    const rawToken = generateInvitationToken();
    const tokenHash = hashInvitationToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    // 7. Persistencia atómica en PostgreSQL
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // Si existía una invitación vencida, revocarla condicionalmente de forma atómica
        if (existingInvitation && existingInvitation.expiresAt <= now) {
          const revocation = await tx.userInvitation.updateMany({
            where: {
              id: existingInvitation.id,
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { lte: now },
            },
            data: { revokedAt: now },
          });

          if (revocation.count === 0) {
            throw new ConflictException(
              'La invitación anterior cambió de estado concurrentemente; no se pudo reemitir',
            );
          }
        }

        return tx.userInvitation.create({
          data: {
            email: normalizedEmail,
            role,
            tokenHash,
            expiresAt,
            createdById,
            areas: {
              create: uniqueAreaIds.map((areaId) => ({ areaId })),
            },
          },
          include: {
            areas: true,
          },
        });
      });

      return {
        invitation: {
          id: created.id,
          email: created.email,
          role: created.role,
          expiresAt: created.expiresAt,
          createdAt: created.createdAt,
          createdById: created.createdById,
          areaIds: created.areas.map((a) => a.areaId),
        },
        rawToken,
      };
    } catch (error) {
      if (isPendingInvitationUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe una invitación pendiente y vigente para este correo electrónico',
        );
      }
      throw error;
    }
  }

  /**
   * Valida un token de invitación verificando su formato, existencia y vigencia.
   *
   * @param token Token de invitación opaco recibido del cliente.
   * @returns Datos autorizados de la invitación si es válida.
   */
  async validateToken(token: string): Promise<ValidatedInvitation> {
    if (
      typeof token !== 'string' ||
      !INVITATION_TOKEN_BASE64URL_REGEX.test(token)
    ) {
      throw new BadRequestException('Token de invitación inválido');
    }

    const tokenHash = hashInvitationToken(token);
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { tokenHash },
      include: { areas: true },
    });

    if (!invitation) {
      throw new NotFoundException('Invitación no encontrada');
    }

    if (invitation.acceptedAt !== null) {
      throw new GoneException('La invitación ya fue utilizada');
    }

    if (invitation.revokedAt !== null) {
      throw new GoneException('La invitación fue revocada');
    }

    if (invitation.expiresAt <= new Date()) {
      throw new GoneException('La invitación ha expirado');
    }

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      areaIds: invitation.areas.map((a) => a.areaId),
    };
  }

  /**
   * Consume una invitación de forma atómica dentro de una transacción de registro.
   *
   * Garantías:
   * 1. No crea transacciones independientes: opera exclusivamente sobre el cliente tx provisto.
   * 2. Si cualquier operación posterior en la transacción de registro falla, la invitación no se consume.
   * 3. Aplica un UPDATE condicional tipo CAS sobre acceptedAt: si dos solicitudes concurrentes intentan
   *    consumir la misma invitación, únicamente la primera actualizará 1 fila y la segunda fallará con 409 Conflict.
   *
   * @param token Token de invitación recibido.
   * @param tx Cliente transaccional de Prisma de la operación de registro.
   * @returns Datos de la invitación consumida para la creación del usuario.
   */
  async consumeInvitation(
    token: string,
    tx: Prisma.TransactionClient,
  ): Promise<ValidatedInvitation> {
    if (
      typeof token !== 'string' ||
      !INVITATION_TOKEN_BASE64URL_REGEX.test(token)
    ) {
      throw new BadRequestException('Token de invitación inválido');
    }

    const tokenHash = hashInvitationToken(token);
    const invitation = await tx.userInvitation.findUnique({
      where: { tokenHash },
      include: { areas: true },
    });

    if (!invitation) {
      throw new NotFoundException('Invitación no encontrada');
    }

    if (invitation.acceptedAt !== null) {
      throw new GoneException('La invitación ya fue utilizada');
    }

    if (invitation.revokedAt !== null) {
      throw new GoneException('La invitación fue revocada');
    }

    if (invitation.expiresAt <= new Date()) {
      throw new GoneException('La invitación ha expirado');
    }

    // Consumo atómico condicional CAS
    const updated = await tx.userInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        acceptedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      throw new ConflictException(
        'La invitación ya fue consumida por otra solicitud concurrente',
      );
    }

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      areaIds: invitation.areas.map((a) => a.areaId),
    };
  }

  /**
   * Retorna todas las invitaciones registradas con su estado actual y áreas.
   */
  async listInvitations(): Promise<InvitationListItemResponse[]> {
    const invitations = await this.prisma.userInvitation.findMany({
      include: {
        areas: {
          include: {
            area: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const now = new Date();

    return invitations.map((inv) => {
      let status: InvitationStatus;
      if (inv.acceptedAt !== null) {
        status = 'ACCEPTED';
      } else if (inv.revokedAt !== null) {
        status = 'REVOKED';
      } else if (inv.expiresAt <= now) {
        status = 'EXPIRED';
      } else {
        status = 'PENDING';
      }

      return {
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status,
        areaIds: inv.areas.map((a) => a.areaId),
        areaNames: inv.areas.map((a) => a.area.name),
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
        acceptedAt: inv.acceptedAt,
        revokedAt: inv.revokedAt,
        createdBy: {
          id: inv.createdBy.id,
          name: inv.createdBy.name,
        },
      };
    });
  }

  /**
   * Revoca una invitación activa impidiendo su uso futuro.
   *
   * @param id Identificador UUID de la invitación.
   */
  async revokeInvitation(id: string): Promise<boolean> {
    const updated = await this.prisma.userInvitation.updateMany({
      where: {
        id,
        acceptedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return updated.count > 0;
  }
}
