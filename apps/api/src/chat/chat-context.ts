// Spec 010 (HU21): el contexto del paso desde el que se consulta al asistente. Quién puede consultar
// sobre qué paso (R3, R4), con las reglas de procedimientos de la spec 006, que se importan y no se
// copian: así la regla de visibilidad vive en un solo lugar.
import { BadRequestException, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Role } from '../common/auth';
import { canViewProcedure, currentVersion } from '../procedures/procedure-access.policy';
import type { ChatContextStore, ConversationStep } from './ports/chat-context-store';

type VersionStatus = 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';

// Lo que el prompt y el embedding necesitan del paso (R6, R8), ya recortado.
export interface StepContext {
    procedureVersionId: string;
    stepId: string;
    procedureTitle: string;
    stepOrder: number;
    stepTitle: string;
    stepDescription: string; // '' si el paso no tiene descripción
}

// Lo que se lee de la base para decidir (una consulta, PD2).
export interface StepRecord {
    version: { id: string; procedureId: string; versionNumber: number; status: VersionStatus; title: string };
    step: { id: string; procedureVersionId: string; stepOrder: number; title: string; description: string } | null;
    procedureAreaIds: string[];
    versions: { versionNumber: number; status: VersionStatus; stepCount: number }[];
}

// Quién pregunta. El rol y las áreas son los que lee el guard en cada pedido.
export interface ContextViewer {
    role: Role;
    areaIds: string[];
}

// Los límites de la spec 006 (R2 y R6), para el prompt (R6).
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

// R3 y R4. null = 404 "El paso no está disponible", sin decir por qué. hasOwnExecution solo se
// llama si la versión es SUPERSEDED y el procedimiento comparte un área con el usuario (PD3).
export async function decideAccess(
    viewer: ContextViewer,
    record: StepRecord | null,
    hasOwnExecution: () => Promise<boolean>,
): Promise<StepContext | null> {
    if (!record?.step || record.step.procedureVersionId !== record.version.id) return null;
    if (viewer.role === 'ADMIN') return toContext(record);

    const sharesArea = record.procedureAreaIds.some((id) => viewer.areaIds.includes(id));
    if (!sharesArea) return null;

    // La vigente (la PUBLISHED más reciente, con pasos), con las reglas de la spec 006 (R13).
    const procedure = { areaIds: record.procedureAreaIds, versions: record.versions };
    const current = currentVersion(record.versions);
    if (current?.versionNumber === record.version.versionNumber && canViewProcedure(viewer, procedure)) {
        return toContext(record);
    }

    // D8: una reemplazada, si el usuario la está ejecutando.
    if (record.version.status === 'SUPERSEDED' && (await hasOwnExecution())) {
        return toContext(record);
    }
    return null;
}

function toContext(record: StepRecord): StepContext {
    const step = record.step!;
    return {
        procedureVersionId: record.version.id,
        stepId: step.id,
        procedureTitle: clip(record.version.title, TITLE_MAX),
        stepOrder: step.stepOrder,
        stepTitle: clip(step.title, TITLE_MAX),
        stepDescription: clip(step.description, DESCRIPTION_MAX),
    };
}

const clip = (text: string, max: number) => {
    const trimmed = text.trim();
    return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};

// --- Con el store (T03) -----------------------------------------------------------------------------

export const STEP_NOT_AVAILABLE = 'El paso no está disponible';
export const CONVERSATION_OTHER_STEP = 'La conversación es de otro paso';
// El mismo texto que el 503 de la spec 009 (R2) antes de transmitir.
const UNAVAILABLE = 'El asistente no está disponible en este momento';

const logger = new Logger('ChatContext');

// Lo del pedido que importa para el contexto.
interface ContextRequest {
    message: string;
    conversationId?: string;
    context?: ConversationStep;
}

// El usuario, como lo arma el guard. Sin rol (no pasa en la app), se lo trata como EMPLOYEE.
type ContextUser = { id: string; areaIds: string[]; role?: Role };

// Antes de resolver la conversación y de transmitir (R2 de la spec 009): el paso de la conversación
// (R7) y el contexto (R3 a R5). Devuelve el contexto, o undefined sin contexto. Sin contexto ni
// conversationId no consulta nada (R9). Sin store (los tests de ChatService), solo sin contexto.
export async function openStepContext(
    store: ChatContextStore | undefined,
    user: ContextUser,
    request: ContextRequest,
): Promise<StepContext | undefined> {
    if (!request.context && !request.conversationId) return undefined;
    if (!store) {
        if (request.context) throw unavailable('No hay ChatContextStore para validar el contexto');
        return undefined;
    }

    if (request.conversationId) {
        await checkConversationStep(store, user.id, request.conversationId, request.context);
    }
    return request.context ? resolveStepContext(store, user, request.context) : undefined;
}

// R3 a R5: 404 sin decir por qué, 503 si la base no responde.
async function resolveStepContext(
    store: ChatContextStore,
    user: ContextUser,
    context: ConversationStep,
): Promise<StepContext> {
    const viewer: ContextViewer = { role: user.role ?? 'EMPLOYEE', areaIds: user.areaIds };
    let decided: StepContext | null;
    try {
        const record = await store.findStep(context.procedureVersionId, context.stepId);
        decided = await decideAccess(viewer, record, () =>
            store.hasInProgressExecution(user.id, context.procedureVersionId),
        );
    } catch (error) {
        throw unavailable(`No se pudo validar el contexto: ${String(error)}`);
    }
    if (!decided) throw new NotFoundException(STEP_NOT_AVAILABLE);
    return decided;
}

// R7: una conversación por paso. Una conversación ajena o que no existe no se decide acá: después
// resolveConversation responde su 404, como hoy.
async function checkConversationStep(
    store: ChatContextStore,
    userId: string,
    conversationId: string,
    context: ConversationStep | undefined,
): Promise<void> {
    let stored: ConversationStep | null | undefined;
    try {
        stored = await store.findConversationStep(userId, conversationId);
    } catch (error) {
        throw unavailable(`No se pudo leer el paso de la conversación: ${String(error)}`);
    }
    if (stored === undefined) return;
    const same =
        stored === null
            ? context === undefined
            : context !== undefined &&
              stored.procedureVersionId === context.procedureVersionId &&
              stored.stepId === context.stepId;
    if (!same) throw new BadRequestException(CONVERSATION_OTHER_STEP);
}

// R7: después de resolver la conversación, el paso de una conversación nueva (el pedido no trajo
// conversationId, PD4). Antes de transmitir: si falla, 503.
export async function rememberConversationStep(
    store: ChatContextStore | undefined,
    request: ContextRequest,
    conversationId: string,
    context: StepContext | undefined,
): Promise<void> {
    if (!context || request.conversationId || !store) return;
    try {
        await store.setConversationStep(conversationId, {
            procedureVersionId: context.procedureVersionId,
            stepId: context.stepId,
        });
    } catch (error) {
        throw unavailable(`No se pudo guardar el paso de la conversación: ${String(error)}`);
    }
}

function unavailable(detail: string): ServiceUnavailableException {
    logger.error(detail);
    return new ServiceUnavailableException(UNAVAILABLE);
}
