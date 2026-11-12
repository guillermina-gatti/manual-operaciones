// HU19 (sección "Qué hace"): a quién consultar cuando no hay información. Con contexto de paso, el
// responsable del procedimiento; si no hay, el responsable del documento más cercano. Es un dato
// accesorio: si la búsqueda falla, la respuesta sale igual, sin contacto.
import type { Logger } from '@nestjs/common';
import type { StepContext } from './chat-context';
import type { Outcome } from './chat-pipeline';
import type { ContactDirectory, ContactPerson } from './ports/contact-directory';

export async function resolveSuggestion(
    directory: ContactDirectory | undefined,
    outcome: Outcome,
    stepContext: StepContext | undefined,
    logger: Pick<Logger, 'warn'>,
): Promise<Outcome> {
    if (!directory || outcome.status !== 'no_info') return outcome;
    try {
        const contact = await findContact(directory, outcome, stepContext);
        return contact ? { ...outcome, suggestedContact: contact } : outcome;
    } catch (error) {
        logger.warn(`No se pudo buscar a quién consultar: ${String(error)}`);
        return outcome;
    }
}

async function findContact(
    directory: ContactDirectory,
    outcome: Outcome,
    stepContext: StepContext | undefined,
): Promise<ContactPerson | null> {
    if (stepContext) {
        const owner = await directory.findProcedureOwner(stepContext.procedureVersionId);
        if (owner) return owner;
    }
    const nearest = outcome.nearest?.[0];
    return nearest ? directory.findDocumentOwner(nearest.documentId) : null;
}