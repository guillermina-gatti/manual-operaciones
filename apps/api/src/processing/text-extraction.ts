// Extrae el texto de un archivo, separado por página.
// .txt y .md se leen como UTF-8; solo el PDF pasa por pdf-parse.
// Todo lo que depende de pdf-parse queda en extractPdfPages, para cambiarlo en un solo lugar.

import { PDFParse } from 'pdf-parse';

export type SupportedFileType = 'pdf' | 'txt' | 'md';

export interface ExtractedPage {
    pageNumber: number; // 1 para txt y md; número real de página en PDF
    text: string;
}

export class UnsupportedFileTypeError extends Error {
    constructor(fileType: string) {
        super(`Tipo de archivo no soportado para extraer texto: ${fileType}`);
        this.name = 'UnsupportedFileTypeError';
    }
}

export async function extractText(
    buffer: Buffer,
    fileType: SupportedFileType,
): Promise<ExtractedPage[]> {
    switch (fileType) {
        case 'txt':
        case 'md':
            return [{ pageNumber: 1, text: decodeUtf8(buffer) }];
        case 'pdf':
            return extractPdfPages(buffer);
        default:
            throw new UnsupportedFileTypeError(String(fileType));
    }
}

// Quita el BOM (\uFEFF) que algunos editores agregan al principio del archivo.
function decodeUtf8(buffer: Buffer): string {
    return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

async function extractPdfPages(buffer: Buffer): Promise<ExtractedPage[]> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
        const result = await parser.getText();
        return result.pages.map((page) => ({
            pageNumber: page.num,
            text: page.text.trim(),
        }));
    } finally {
        await parser.destroy();
    }
}