import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { AuthUser } from '../common/auth';
import { FileStorage } from '../storage/file-storage';
import { canBeOwner } from './document-access.policy';
import { DocumentsRepository } from './documents.repository';
import { CreateDocumentDto } from './dto/create-document.dto';
import {
  InspectedFile,
  UploadedFileInput,
  inspectFile,
} from './file-inspector';
import { AreasDirectory } from './ports/areas-directory';
import { UsersDirectory } from './ports/users-directory';

const DEFAULT_TIME_ZONE = 'America/Argentina/Buenos_Aires';

// Orquesta la carga (plan 4). Esta parte cubre los pasos 3b a 3f: nada se escribe hasta que pasan todos.
@Injectable()
export class DocumentUploadService {
  // Se crea al construir el servicio: una APP_TIMEZONE inválida falla al arrancar (D1).
  private readonly todayFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.APP_TIMEZONE || DEFAULT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  constructor(
    private readonly areas: AreasDirectory,
    private readonly users: UsersDirectory,
    private readonly documents: DocumentsRepository,
    private readonly storage: FileStorage,
  ) {}

  // El actor lo usa la escritura (T15): createdById y auditoría.
  async upload(
    file: UploadedFileInput | undefined,
    dto: CreateDocumentDto,
    _actor: AuthUser,
  ): Promise<void> {
    await this.validateBeforeWriting(file, dto);
  }

  private async validateBeforeWriting(
    file: UploadedFileInput | undefined,
    dto: CreateDocumentDto,
  ): Promise<InspectedFile> {
    const inspected = inspectFile(file); // 3b: 400 o 415 (R2, R3)
    this.assertReviewDateIsAfterToday(dto.reviewDate); // 3c (R6, D1)
    await this.assertAreasExist(dto.areaIds); // 3d (R5)
    await this.assertOwnerCanSeeDocument(dto.ownerId, dto.areaIds); // 3e (R5)
    await this.assertNotDuplicated(inspected.checksum); // 3f (R8b)
    return inspected;
  }

  // R6: posterior a la fecha de carga, por día y en la zona horaria de la empresa.
  // Las dos fechas son YYYY-MM-DD, así que alcanza con comparar los textos.
  private assertReviewDateIsAfterToday(reviewDate: string): void {
    const today = this.today();
    if (reviewDate <= today) {
      throw new BadRequestException(
        `reviewDate tiene que ser posterior a hoy (${today})`,
      );
    }
  }

  private today(): string {
    const parts = Object.fromEntries(
      this.todayFormat
        .formatToParts(new Date())
        .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  private async assertAreasExist(areaIds: string[]): Promise<void> {
    const existing = new Set(await this.areas.findExistingIds(areaIds));
    const missing = areaIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `areaIds: no existen las áreas ${missing.join(', ')}`,
      );
    }
  }

  // El responsable puede tener cualquier rol, pero tiene que poder ver el documento.
  private async assertOwnerCanSeeDocument(
    ownerId: string,
    areaIds: string[],
  ): Promise<void> {
    const owner = await this.users.findById(ownerId);
    if (!owner) {
      throw new BadRequestException('ownerId: el responsable no existe');
    }
    if (!canBeOwner(owner, areaIds)) {
      throw new BadRequestException(
        'ownerId: el responsable no comparte ningún área con el documento',
      );
    }
  }

  private async assertNotDuplicated(checksum: string): Promise<void> {
    const duplicate = await this.documents.findActiveByChecksum(checksum);
    if (duplicate) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Ya hay un documento vigente con el mismo archivo',
        error: 'Conflict',
        existingDocumentId: duplicate.documentId,
      });
    }
  }
}
