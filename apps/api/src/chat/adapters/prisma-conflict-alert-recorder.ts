// Spec 011 (R11, R13): registra la alerta de una contradicción en una sola sentencia (plan 011, PD5).
// Con el mismo par de versiones no se crea otra: si la que hay está abierta, suma una repetición; si
// está resuelta, no cambia. El índice único resuelve dos consultas al mismo tiempo.
import { Injectable } from '@nestjs/common';
import { orderConflictPair } from '../../documents/conflict-alerts/conflict-pair';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictAlertRecorder, type ConflictAlertInput } from '../ports/conflict-alert-recorder';

@Injectable()
export class PrismaConflictAlertRecorder extends ConflictAlertRecorder {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async record({ messageId, question, first, second }: ConflictAlertInput): Promise<void> {
        const { a, b } = orderConflictPair(
            { documentId: first.documentId, versionId: first.versionId, chunkId: first.chunkId },
            { documentId: second.documentId, versionId: second.versionId, chunkId: second.chunkId },
        );

        await this.prisma.$executeRaw`
            INSERT INTO document_conflict_alerts
                (id, document_a_id, document_b_id, version_a_id, version_b_id, chunk_a_id, chunk_b_id,
                 message_id, question)
            VALUES
                (gen_random_uuid(), ${a.documentId}::uuid, ${b.documentId}::uuid, ${a.versionId}::uuid,
                 ${b.versionId}::uuid, ${a.chunkId}::uuid, ${b.chunkId}::uuid, ${messageId}::uuid,
                 ${question.slice(0, 2000)})
            ON CONFLICT (version_a_id, version_b_id) DO UPDATE
                SET occurrences = document_conflict_alerts.occurrences + 1,
                    last_detected_at = now()
                WHERE document_conflict_alerts.status = 'OPEN'
        `;
    }
}
