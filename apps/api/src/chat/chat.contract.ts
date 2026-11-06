// Contrato 4 del informe (pareja C → B). Tipos compartidos del chat.
// Fuente: informe del proyecto, sección "Contrato 4 · Asistente".

export type ChatResultStatus = 'answered' | 'no_info' | 'conflict' | 'ai_unavailable';

export interface ChatRequest {
    conversationId?: string; // sin valor: conversación nueva
    message: string; // hasta 2.000 caracteres
    context?: { procedureVersionId: string; stepId: string };
}

export interface ChatSource {
    documentId: string;
    documentTitle: string;
    versionNumber: number;
    section: string;
    chunkId: string;
    validFrom: string; // fecha de vigencia del documento (YYYY-MM-DD)
    url: string; // enlace firmado al pasaje
}

// HU19: un documento cercano a la consulta cuando no hay información suficiente. No es una fuente.
export interface NearestDocument {
    documentId: string;
    documentTitle: string;
}

export interface ChatResult {
    conversationId: string;
    messageId: string;
    status: ChatResultStatus;
    answer: string;
    sources: ChatSource[];
    suggestedContact?: { name: string; email: string }; // solo cuando status = no_info
    nearestDocuments?: NearestDocument[]; // solo cuando status = no_info (HU19)
}

export interface ChatFeedbackRequest {
    useful: boolean;
    comment?: string; // hasta 500 caracteres
}