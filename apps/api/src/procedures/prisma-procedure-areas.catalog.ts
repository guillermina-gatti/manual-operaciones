/* Reads the state of the areas from PostgreSQL. It only reads id and isActive of areas; it never writes */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isUnavailable } from './prisma-procedures.repository';
import { AreaState, ProcedureAreasCatalog } from './procedure-areas.catalog';
import { ProceduresRepositoryUnavailableError } from './procedures.repository';

@Injectable()
export class PrismaProcedureAreasCatalog extends ProcedureAreasCatalog {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findStates(ids: string[]): Promise<AreaState[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    try {
      return await this.prisma.area.findMany({
        where: { id: { in: unique } },
        select: { id: true, isActive: true },
      });
    } catch (error) {
      if (isUnavailable(error)) {
        throw new ProceduresRepositoryUnavailableError(
          'La base de datos no responde',
          { cause: error },
        );
      }
      throw error;
    }
  }
}
