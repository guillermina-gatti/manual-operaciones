// Spec 010: el contexto del paso con Prisma. Lee tablas de la pareja B (procedure_versions, steps,
// procedure_areas, executions) solo para validar, sin escribirlas; escribe solo las dos columnas del
// paso en conversations.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { StepRecord } from '../chat-context';
import { ChatContextStore, type ConversationStep } from '../ports/chat-context-store';

@Injectable()
export class PrismaChatContextStore extends ChatContextStore {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    // Una consulta (PD2): la versión con ese paso, y las áreas y versiones del procedimiento.
    async findStep(procedureVersionId: string, stepId: string): Promise<StepRecord | null> {
        const version = await this.prisma.procedureVersion.findUnique({
            where: { id: procedureVersionId },
            select: {
                id: true,
                procedureId: true,
                versionNumber: true,
                status: true,
                title: true,
                steps: {
                    where: { id: stepId },
                    select: { id: true, procedureVersionId: true, stepOrder: true, title: true, description: true },
                },
                procedure: {
                    select: {
                        areas: { select: { areaId: true } },
                        versions: {
                            select: { versionNumber: true, status: true, _count: { select: { steps: true } } },
                        },
                    },
                },
            },
        });
        if (!version) return null;

        const { steps, procedure, ...rest } = version;
        return {
            version: rest,
            step: steps[0] ?? null,
            procedureAreaIds: procedure.areas.map((a) => a.areaId),
            versions: procedure.versions.map((v) => ({
                versionNumber: v.versionNumber,
                status: v.status,
                stepCount: v._count.steps,
            })),
        };
    }

    async hasInProgressExecution(userId: string, procedureVersionId: string): Promise<boolean> {
        const count = await this.prisma.execution.count({
            where: { userId, procedureVersionId, status: 'IN_PROGRESS' },
        });
        return count > 0;
    }

    async findConversationStep(userId: string, conversationId: string): Promise<ConversationStep | null | undefined> {
        const conversation = await this.prisma.conversation.findFirst({
            where: { id: conversationId, userId },
            select: { procedureVersionId: true, stepId: true },
        });
        if (!conversation) return undefined;
        const { procedureVersionId, stepId } = conversation;
        return procedureVersionId && stepId ? { procedureVersionId, stepId } : null;
    }

    async setConversationStep(conversationId: string, step: ConversationStep): Promise<void> {
        await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { procedureVersionId: step.procedureVersionId, stepId: step.stepId },
        });
    }
}
