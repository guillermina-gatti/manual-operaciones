// Spec 010 (R3 a R5, R7; PD1): lo que el chat lee para validar el contexto del paso, y el paso de
// cada conversación. Aparte de ChatRepository, para que su puerto y su adaptador no cambien.
import type { StepRecord } from '../chat-context';

export interface ConversationStep {
    procedureVersionId: string;
    stepId: string;
}

export abstract class ChatContextStore {
    // La versión, ese paso (si es de esa versión), las áreas y las versiones del procedimiento.
    abstract findStep(procedureVersionId: string, stepId: string): Promise<StepRecord | null>;

    // Si el usuario tiene una ejecución en curso propia en esa versión (D8).
    abstract hasInProgressExecution(userId: string, procedureVersionId: string): Promise<boolean>;

    // El paso de una conversación del usuario: undefined si no existe o no es suya; null si no tiene.
    abstract findConversationStep(userId: string, conversationId: string): Promise<ConversationStep | null | undefined>;

    // Guarda el paso de una conversación recién creada (R7).
    abstract setConversationStep(conversationId: string, step: ConversationStep): Promise<void>;
}
