import {
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';

export type FileKind = 'pdf' | 'txt' | 'md';

export interface InspectedFile {
  kind: FileKind;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  checksum: string;
}

// Solo lo que hace falta del archivo de multer: el `mimetype` del navegador no se usa.
export interface UploadedFileInput {
  buffer: Buffer;
  originalname: string;
}

const PDF_SIGNATURE = Buffer.from('%PDF-', 'ascii');

const isPdf = (buffer: Buffer) =>
  buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);

const isUtf8Text = (buffer: Buffer) => {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
};

const ACCEPTED: Record<
  string,
  { kind: FileKind; mimeType: string; matches: (buffer: Buffer) => boolean }
> = {
  pdf: { kind: 'pdf', mimeType: 'application/pdf', matches: isPdf },
  txt: { kind: 'txt', mimeType: 'text/plain', matches: isUtf8Text },
  md: { kind: 'md', mimeType: 'text/markdown', matches: isUtf8Text },
};

export function inspectFile(
  file: UploadedFileInput | undefined,
): InspectedFile {
  if (!file || file.buffer.length === 0) {
    throw new BadRequestException('Falta el archivo o está vacío');
  }

  const extension = extname(file.originalname).slice(1).toLowerCase();
  const type = Object.hasOwn(ACCEPTED, extension)
    ? ACCEPTED[extension]
    : undefined;
  if (!type || !type.matches(file.buffer)) {
    throw new UnsupportedMediaTypeException(
      'Solo se aceptan archivos PDF, .txt o .md',
    );
  }

  return {
    kind: type.kind,
    mimeType: type.mimeType,
    extension,
    sizeBytes: file.buffer.length,
    checksum: createHash('sha256').update(file.buffer).digest('hex'),
  };
}
