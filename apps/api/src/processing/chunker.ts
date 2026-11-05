/* Divide el texto de una versión en fragmentos de unos pocos párrafos (plan 5.2).
   Respeta los títulos de sección, no mezcla páginas en un mismo fragmento y
   guarda page_number para poder citar. Es código puro: no usa base ni red. */
import type { FileKind } from '../documents/file-inspector';
import type { ExtractedPage } from './text-extraction';

// Tamaño objetivo de un fragmento, en tokens estimados. Un fragmento de "unos pocos párrafos".
export const MAX_CHUNK_TOKENS = 400;

// Estimación sin llamar a ningún tokenizador: aproximadamente 4 caracteres por token.
export function estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
}

export interface ChunkDraft {
    chunkIndex: number;
    content: string;
    pageNumber: number | null;
    tokenCount: number;
    // Título de la sección donde empieza el fragmento; null si el texto no tiene títulos.
    section: string | null;
}

export interface ChunkOptions {
    kind: FileKind;
    maxTokens?: number;
}

type Block =
    | { type: 'heading'; text: string }
    | { type: 'paragraph'; text: string };

// Un título en .md es una línea que empieza con #.
const MARKDOWN_HEADING = /^#{1,6}\s+(.+)$/;

// En .txt no hay marcas: se toma como título un párrafo de una sola línea, corta y sin
// puntuación final. Es una heurística; un párrafo corto así también se trata como título.
function isPlainHeading(line: string): boolean {
    return line.length <= 80 && !/[.:;,!?]$/.test(line);
}

function toBlocks(page: ExtractedPage, kind: FileKind): Block[] {
    const blocks: Block[] = [];
    let lines: string[] = [];

    const flush = () => {
        if (lines.length === 0) return;
        const text = lines.join('\n').trim();
        const isHeading = kind === 'txt' && lines.length === 1 && isPlainHeading(text);
        blocks.push({ type: isHeading ? 'heading' : 'paragraph', text });
        lines = [];
    };

    for (const rawLine of page.text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line === '') {
            flush();
            continue;
        }
        const heading = MARKDOWN_HEADING.exec(line);
        if (heading) {
            flush();
            blocks.push({ type: 'heading', text: heading[1].trim() });
            continue;
        }
        lines.push(line);
    }
    flush();
    return blocks;
}

// Parte un párrafo que no entra en un fragmento: primero por oraciones, y si una oración
// sola es demasiado larga, por palabras.
function splitLong(text: string, maxTokens: number): string[] {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return [text];

    const pieces: string[] = [];
    let current = '';
    const pushPiece = (piece: string) => {
        if (current !== '' && current.length + 1 + piece.length > maxChars) {
            pieces.push(current);
            current = piece;
        } else {
            current = current === '' ? piece : `${current} ${piece}`;
        }
    };

    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        if (sentence.length <= maxChars) {
            pushPiece(sentence);
            continue;
        }
        for (const word of sentence.split(/\s+/)) {
            // Una palabra más larga que el máximo se parte en trozos: nunca se descarta texto.
            for (let i = 0; i < word.length; i += maxChars) {
                pushPiece(word.slice(i, i + maxChars));
            }
        }
    }
    if (current !== '') pieces.push(current);
    return pieces;
}

export function chunkPages(
    pages: ExtractedPage[],
    { kind, maxTokens = MAX_CHUNK_TOKENS }: ChunkOptions,
): ChunkDraft[] {
    const chunks: ChunkDraft[] = [];
    let section: string | null = null;

    for (const page of pages) {
        let current: string[] = [];
        let currentSection: string | null = section;
        let currentTokens = 0;

        const emit = () => {
            if (current.length === 0) return;
            const content = current.join('\n\n');
            chunks.push({
                chunkIndex: chunks.length,
                content,
                pageNumber: kind === 'pdf' ? page.pageNumber : null,
                tokenCount: estimateTokens(content),
                section: currentSection,
            });
            current = [];
            currentTokens = 0;
        };

        for (const block of toBlocks(page, kind)) {
            if (block.type === 'heading') {
                emit(); // un título siempre abre un fragmento nuevo
                section = block.text;
                continue;
            }
            for (const piece of splitLong(block.text, maxTokens)) {
                const pieceTokens = estimateTokens(piece);
                if (current.length > 0 && currentTokens + pieceTokens > maxTokens) emit();
                if (current.length === 0) currentSection = section;
                current.push(piece);
                currentTokens += pieceTokens;
            }
        }
        emit(); // los fragmentos no cruzan páginas
    }

    return chunks;
}