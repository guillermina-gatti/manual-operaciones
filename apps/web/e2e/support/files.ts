// Archivos de prueba en memoria para setInputFiles. Cada uno lleva una marca única,
// así dos corridas contra la API real no chocan con el 409 de archivo duplicado.
const MB = 1024 * 1024;

export interface TestFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

let counter = 0;
const stamp = () => `${Date.now()}-${process.pid}-${(counter += 1)}`;

// Un PDF de exactamente sizeBytes, que empieza con %PDF- como pide la API (R2).
export function pdfFile(name = 'manual.pdf', sizeBytes = 2 * MB): TestFile {
  const header = Buffer.from(`%PDF-1.4\n% ${stamp()}\n`);
  const buffer = Buffer.alloc(Math.max(sizeBytes, header.length), ' ');
  header.copy(buffer);
  return { name, mimeType: 'application/pdf', buffer: buffer.subarray(0, sizeBytes) };
}

export function markdownFile(name = 'guía.md', text = '# Guía\n\nTexto de prueba.\n'): TestFile {
  return { name, mimeType: 'text/markdown', buffer: Buffer.from(`${text}\n<!-- ${stamp()} -->\n`, 'utf8') };
}

export function textFile(name = 'notas.txt', text = 'Texto de prueba.'): TestFile {
  return { name, mimeType: 'text/plain', buffer: Buffer.from(`${text}\n${stamp()}\n`, 'utf8') };
}

// Un tipo que la web no acepta (E5). El contenido no importa: se rechaza por la extensión.
export function docxFile(name = 'manual.docx'): TestFile {
  return {
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(`PK docx de prueba ${stamp()}`),
  };
}

export const megabytes = (n: number) => n * MB;
