/* Validador e inspector de archivos*/
import {
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';

// 1. Definimos los únicos tipos de archivos permitidos
export type FileKind = 'pdf' | 'txt' | 'md';

// 2. Definimos la estructura del objeto que devolveremos con los datos del archivo
export interface InspectedFile {
  kind: FileKind;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  checksum: string;
}

// 3. Estructura que esperamos recibir de Multer (solo necesitamos el buffer y el nombre)
export interface UploadedFileInput {
  buffer: Buffer;
  originalname: string;
}

// Firma digital clásica para identificar un archivo PDF real por sus bytes
const PDF_SIGNATURE = Buffer.from('%PDF-', 'ascii');

// Función para validar si el archivo es realmente un PDF revisando su contenido interno
const isPdf = (buffer: Buffer) =>
  buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);

// Función para validar si un texto plano o Markdown está codificado correctamente en UTF-8
const isUtf8Text = (buffer: Buffer) => {
  if (buffer.includes(0)) return false; // Si tiene bytes nulos, no es texto plano válido
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
};

// Diccionario con las reglas de validación para cada formato aceptado
const ACCEPTED: Record<
  string,
  { kind: FileKind; mimeType: string; matches: (buffer: Buffer) => boolean }
> = {
  pdf: { kind: 'pdf', mimeType: 'application/pdf', matches: isPdf },
  txt: { kind: 'txt', mimeType: 'text/plain', matches: isUtf8Text },
  md: { kind: 'md', mimeType: 'text/markdown', matches: isUtf8Text },
};

// Función principal que inspecciona, valida y extrae metadatos del archivo
export function inspectFile(
  file: UploadedFileInput | undefined,
): InspectedFile {
  // Validación 1: Comprobamos que el archivo exista y no esté vacío
  if (!file || file.buffer.length === 0) {
    throw new BadRequestException('Falta el archivo o está vacío');
  }

  // Obtenemos la extensión del archivo a partir de su nombre original
  const extension = extname(file.originalname).slice(1).toLowerCase();

  // Verificamos si la extensión está dentro de las permitidas
  const type = Object.hasOwn(ACCEPTED, extension)
    ? ACCEPTED[extension]
    : undefined;

  // Validación 2: Comprobamos que la extensión sea válida Y que el contenido real (buffer) coincida
  if (!type || !type.matches(file.buffer)) {
    throw new UnsupportedMediaTypeException(
      'Solo se aceptan archivos PDF, .txt o .md',
    );
  }

  // Si todo es correcto, retornamos los metadatos limpios y seguros del archivo
  return {
    kind: type.kind,
    mimeType: type.mimeType,
    extension,
    sizeBytes: file.buffer.length,
    // Generamos una huella digital única (checksum) del archivo usando SHA-256
    checksum: createHash('sha256').update(file.buffer).digest('hex'),
  };
}
