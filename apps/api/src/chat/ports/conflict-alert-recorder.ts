// Spec 011 (R12, R13, R19): puerto con el que el chat registra la alerta de una contradicción. La
// implementación real escribe en document_conflict_alerts (adapters/prisma-conflict-alert-recorder.ts).
import type { RetrievedChunk } from './chat-retrieval';

export interface ConflictAlertInput {
    messageId: string; // el mensaje guardado como CONFLICT
    question: string;
    first: RetrievedChunk; // los dos pasajes de la contradicción, en cualquier orden
    second: RetrievedChunk;
}

export abstract class ConflictAlertRecorder {
    // Crea la alerta, o suma una repetición si ya hay una abierta para ese par de versiones.
    abstract record(input: ConflictAlertInput): Promise<void>;
}
