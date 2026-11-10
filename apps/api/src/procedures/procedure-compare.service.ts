/* Compare two versions of a procedure (spec 015, R10) */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { compareVersions } from './version-compare';
import type { Comparison } from './version-compare';
import { procedureNotFound, runAsAdmin } from './version-operation';
import { VersionsRepository } from './versions.repository';

@Injectable()
export class ProcedureCompareService {
  private readonly logger = new Logger(ProcedureCompareService.name);

  constructor(private readonly versions: VersionsRepository) {}

  compare(user: AuthUser, procedureId: string, from: string, to: string): Promise<Comparison> {
    return runAsAdmin('compareVersions', user, this.logger, async () => {
      if (from === to) throw new BadRequestException('Elegí dos versiones distintas para comparar');
      const found = await this.versions.findForCompare(procedureId, from, to);
      if (!found) throw procedureNotFound();
      return compareVersions(found.from, found.to);
    });
  }
}
