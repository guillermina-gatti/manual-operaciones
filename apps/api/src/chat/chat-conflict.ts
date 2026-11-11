// Spec 011 (HU39): la marca con la que el modelo avisa que dos documentos se contradicen. La primera
// línea de la respuesta es exactamente "CONFLICT [Sx] [Sy]" (R4), y la API solo la acepta si nombra
// dos pasajes de esta consulta, de documentos distintos, y viene una explicación después (R5). Lo usan
// finishChat (POST /api/chat y la respuesta final de la transmisión) y el retén de la transmisión,
// así las dos rutas nunca deciden distinto (plan 011, PD1 y PD3).
import type { Logger } from '@nestjs/common';
import type { ChatResult } from './chat.contract';
import type { StepContext } from './chat-context';
import type { Outcome } from './chat-pipeline';
import type { ChatLlm, LlmAnswer, LlmRequestOptions, Passage } from './ports/chat-llm';
import type { ConflictAlertRecorder } from './ports/conflict-alert-recorder';
import type { RetrievedChunk } from './ports/chat-retrieval';

export const CONFLICT_MARKER = 'CONFLICT';

// Sin los espacios iniciales ni los finales de la línea; con espacios simples y nada más.
const MARKER_LINE = /^CONFLICT \[S(\d+)\] \[S(\d+)\]$/;

// none: no empieza con la marca. conflict: first es el pasaje de número menor. invalid: empieza con
// la marca pero no cumple R5, y se trata como answered con el cuerpo (R6); reason es para el log.
export type MarkerReading =
    | { kind: 'none' }
    | { kind: 'conflict'; first: RetrievedChunk; second: RetrievedChunk; body: string }
    | { kind: 'invalid'; body: string; reason: string };

// sameDocument: la línea tiene la forma y nombra dos pasajes de esta consulta, pero del mismo
// documento (ajuste del 11/11/2026: es el caso en que se le pide la respuesta otra vez al modelo).
export type MarkerLine =
    | { ok: true; first: RetrievedChunk; second: RetrievedChunk }
    | { ok: false; reason: string; sameDocument?: [number, number] };

// La primera línea sola (R5, sin la explicación): la forma, los dos pasajes y los dos documentos. La
// usa también el retén de la transmisión, que decide apenas llega el fin de la línea.
export function checkMarkerLine(line: string, chunks: RetrievedChunk[]): MarkerLine {
    const trimmed = line.trim();
    const match = MARKER_LINE.exec(trimmed);
    if (!match) return { ok: false, reason: `la línea no tiene la forma "CONFLICT [Sx] [Sy]": ${trimmed.slice(0, 80)}` };

    const [x, y] = [Number(match[1]), Number(match[2])].sort((a, b) => a - b);
    if (x === y) return { ok: false, reason: `la marca nombra dos veces el pasaje S${x}` };
    if (x < 1 || y > chunks.length) {
        return { ok: false, reason: `la marca nombra un pasaje que no existe (S${x}, S${y}; hay ${chunks.length})` };
    }

    const first = chunks[x - 1];
    const second = chunks[y - 1];
    if (first.documentId === second.documentId) {
        return {
            ok: false,
            reason: `S${x} y S${y} son del mismo documento (${first.documentId})`,
            sameDocument: [x, y],
        };
    }
    return { ok: true, first, second };
}

// La primera línea y lo que sigue, para un texto que empieza (sin los espacios iniciales) con la marca.
export function splitMarkerLine(text: string): { line: string; rest: string; complete: boolean } {
    const trimmed = text.trimStart();
    const newline = trimmed.indexOf('\n');
    return newline === -1
        ? { line: trimmed, rest: '', complete: false }
        : { line: trimmed.slice(0, newline), rest: trimmed.slice(newline + 1), complete: true };
}

// La palabra CONFLICT sola al principio (sin los espacios iniciales), seguida de un espacio, un salto
// de línea o el fin: "CONFLICTIVO…" no es la marca.
export function startsWithMarker(text: string): boolean {
    return /^CONFLICT(\s|$)/.test(text.trimStart());
}

// chunks son los fragmentos de la consulta, en el orden de S1, S2…
export function readConflictMarker(text: string, chunks: RetrievedChunk[]): MarkerReading {
    if (!startsWithMarker(text)) return { kind: 'none' };

    const { line, rest } = splitMarkerLine(text);
    const body = rest.trim();
    const checked = checkMarkerLine(line, chunks);
    if (!checked.ok) return { kind: 'invalid', body, reason: checked.reason };
    if (!body) return { kind: 'invalid', body, reason: 'la marca no trae explicación' };

    return { kind: 'conflict', first: checked.first, second: checked.second, body };
}

// --- Ajuste del 11/11/2026: la marca entre pasajes del mismo documento ------------------------------
// Probando con Gemini real, el modelo a veces marca CONFLICT entre una regla general y su excepción,
// del mismo documento. La API descarta esa marca (R5), y lo que quedaba era la explicación, sin
// conclusión. Ahora se le pide la respuesta otra vez, una sola vez, con un aviso. Lo usan las dos
// rutas: ChatService con answerChecked y ChatStreamService con las mismas piezas.

// Las dos marcas de pasaje si la respuesta empieza con CONFLICT entre dos pasajes del mismo documento.
export function sameDocumentRefs(text: string, chunks: RetrievedChunk[]): [number, number] | null {
    if (!startsWithMarker(text)) return null;
    const checked = checkMarkerLine(splitMarkerLine(text).line, chunks);
    return !checked.ok && checked.sameDocument ? checked.sameDocument : null;
}

export function retryOptions([x, y]: [number, number]): LlmRequestOptions {
    return { sameDocumentRefs: [`S${x}`, `S${y}`] };
}

export const retryNotice = ([x, y]: [number, number]) =>
    `El modelo marcó una contradicción entre S${x} y S${y}, del mismo documento: se le pide la respuesta otra vez`;

export const retryFailedNotice = (error: unknown) =>
    `Falló el segundo pedido al modelo, se responde con el primero: ${String(error)}`;

// La respuesta del segundo pedido, con los tokens de los dos (se guardan sumados).
export function bothAnswers(first: LlmAnswer, second: LlmAnswer): LlmAnswer {
    const sum = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));
    return {
        ...second,
        inputTokens: sum(first.inputTokens, second.inputTokens),
        outputTokens: sum(first.outputTokens, second.outputTokens),
    };
}

// POST /api/chat: la respuesta del modelo y, si marcó CONFLICT entre pasajes del mismo documento, la
// del segundo pedido. Un error del primero sale como siempre (ai_unavailable); si falla el segundo,
// queda el primero, que finishChat trata como una marca inválida (R6).
export async function answerChecked(
    llm: ChatLlm,
    question: string,
    prepared: { chunks: RetrievedChunk[]; passages: Passage[] },
    logger: Pick<Logger, 'warn'>,
    context?: StepContext,
): Promise<LlmAnswer> {
    const first = await llm.answer(question, prepared.passages, context);
    const refs = sameDocumentRefs(first.text, prepared.chunks);
    if (!refs) return first;

    logger.warn(retryNotice(refs));
    try {
        return bothAnswers(first, await llm.answer(question, prepared.passages, context, retryOptions(refs)));
    } catch (error) {
        logger.warn(retryFailedNotice(error));
        return first;
    }
}

// El número de pasaje de cada fragmento de la contradicción, para keepOnlyRefs.
export function refsOf(reading: { first: RetrievedChunk; second: RetrievedChunk }, chunks: RetrievedChunk[]): [number, number] {
    return [chunks.indexOf(reading.first) + 1, chunks.indexOf(reading.second) + 1];
}

// R7: la explicación cita solo los dos pasajes de la contradicción; las demás marcas [Sn] se quitan,
// con el espacio que las precede, como withoutMarkers de la web.
export function keepOnlyRefs(body: string, refs: [number, number]): string {
    return body.replace(/\s?\[S(\d+)\]/g, (marker, ref: string) => (refs.includes(Number(ref)) ? marker : ''));
}

// R12: después de guardar la consulta (saveResult), en las dos rutas. Solo con status conflict, así
// una respuesta sin contradicción no toca la base (E17). Si el registro falla, el usuario recibe su
// respuesta igual y el error queda en el log: el mensaje guardado como CONFLICT permite rearmarla.
export async function recordConflictAlert(
    recorder: ConflictAlertRecorder | undefined,
    outcome: Outcome,
    result: ChatResult,
    question: string,
    logger: Pick<Logger, 'error' | 'warn'>,
): Promise<void> {
    if (outcome.status !== 'conflict' || !outcome.conflict) return;
    const { first, second } = outcome.conflict;
    const pair = `${first.documentId} y ${second.documentId}`;

    // La dependencia es opcional para los tests que construyen el servicio sin ella (plan 011, PD6).
    if (!recorder) {
        logger.warn(`Contradicción entre ${pair} sin registrar: no hay ConflictAlertRecorder`);
        return;
    }
    try {
        await recorder.record({ messageId: result.messageId, question, first, second });
    } catch (error) {
        logger.error(
            `No se pudo registrar la alerta de contradicción entre ${pair} (mensaje ${result.messageId}): ${String(error)}`,
        );
    }
}
