// HU18: enlace firmado al archivo de cada fuente que va en la respuesta. Se firma recién al responder
// y solo para las fuentes citadas (outcome.chunks): el enlace vence a los 5 minutos (FileStorage).
// Si la firma de una fuente falla, esa fuente queda sin enlace y la respuesta sale igual.
import type { Logger } from '@nestjs/common';
import type { FileStorage } from '../storage/file-storage';
import type { Outcome } from './chat-pipeline';
import type { RetrievedChunk } from './ports/chat-retrieval';

export async function withSignedLinks(
    storage: FileStorage | undefined,
    outcome: Outcome,
    logger: Pick<Logger, 'warn'>,
): Promise<Outcome> {
    if (!storage || outcome.chunks.length === 0) return outcome;

    const signed = await Promise.all(outcome.chunks.map((c) => signChunk(storage, c, logger)));
    const byId = new Map(signed.map((c) => [c.chunkId, c]));
    const conflict = outcome.conflict && {
        first: byId.get(outcome.conflict.first.chunkId) ?? outcome.conflict.first,
        second: byId.get(outcome.conflict.second.chunkId) ?? outcome.conflict.second,
    };
    return { ...outcome, chunks: signed, ...(conflict ? { conflict } : {}) };
}

async function signChunk(
    storage: FileStorage,
    chunk: RetrievedChunk,
    logger: Pick<Logger, 'warn'>,
): Promise<RetrievedChunk> {
    if (!chunk.storageKey || !chunk.fileName) return chunk;
    try {
        const { url } = await storage.getDownloadUrl(chunk.storageKey, chunk.fileName);
        return { ...chunk, url };
    } catch (error) {
        logger.warn(`No se pudo firmar el enlace de la fuente ${chunk.chunkId}: ${String(error)}`);
        return chunk;
    }
}