// Respuesta del listado de documentos por área, compartida por POST /api/chat y POST /api/chat/stream.
// Devuelve null si la pregunta no es un listado, así que sigue a la búsqueda como cualquier otra.
import type { Logger } from '@nestjs/common';
import { areaNamed, formatAreaChoice, formatAreas, formatCatalog, isAreasQuestion, isCatalogQuestion, isDocumentChoiceQuestion, isDocumentsOfAreaQuestion, isShortQuestion } from './chat-catalog';
import { type ChatUser, type Outcome, NO_INFO_TEXT, unavailable } from './chat-pipeline';
import type { ChatDocumentsCatalog } from './ports/chat-documents-catalog';

export async function catalogOutcome(
    catalog: ChatDocumentsCatalog | undefined,
    user: ChatUser,
    question: string,
    logger: Pick<Logger, 'warn'>,
): Promise<Outcome | null> {
    // Corta: puede ser solo el nombre de un área ("ventas"), así que se consulta y se mira si la nombra.
    const areas = isAreasQuestion(question);
    const choice = isDocumentChoiceQuestion(question);
    const candidate = areas || choice || isCatalogQuestion(question) || isDocumentsOfAreaQuestion(question) || isShortQuestion(question);
    if (!catalog || !candidate) return null;

    // Mismo alcance que la búsqueda: ADMIN ve todas las áreas, el resto solo las suyas.
    const scope = user.role === 'ADMIN' ? null : user.areaIds;
    if (scope !== null && scope.length === 0) {
        return { status: 'no_info', answer: NO_INFO_TEXT, chunks: [] };
    }

    try {
        const groups = await catalog.listByArea(scope);
        if (areas) {
            return { status: 'answered', answer: formatAreas(groups), chunks: [] };
        }
        if (isCatalogQuestion(question)) {
            return { status: 'answered', answer: formatCatalog(groups), chunks: [] };
        }
        // "documento", "archivos", "más o menos algo con doc": no dice el área. Se pregunta cuál.
        // Si solo hay una con documentos, no hay nada que elegir y se listan directo.
        if (choice) {
            const withDocuments = groups.filter((group) => group.titles.length > 0);
            const answer = withDocuments.length === 1 ? formatCatalog(groups) : formatAreaChoice(groups);
            return { status: 'answered', answer, chunks: [] };
        }
        // "documentos de ventas": solo el área nombrada. Si no nombra ninguna del alcance, se busca normal.
        const name = areaNamed(question, groups.map((group) => group.areaName));
        if (name === null) return null;
        return {
            status: 'answered',
            answer: formatCatalog(groups.filter((group) => group.areaName === name)),
            chunks: [],
        };
    } catch (error) {
        logger.warn(`Falló el listado de documentos por área: ${String(error)}`);
        return unavailable();
    }
}