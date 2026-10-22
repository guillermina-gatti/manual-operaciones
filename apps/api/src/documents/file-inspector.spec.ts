import {
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { inspectFile } from './file-inspector';

const file = (originalname: string, content: string | Buffer) => ({
  originalname,
  buffer: typeof content === 'string' ? Buffer.from(content, 'utf8') : content,
});

describe('inspectFile', () => {
  describe('archivos aceptados', () => {
    it('acepta un PDF que empieza con %PDF-', () => {
      const pdf = file('manual.pdf', '%PDF-1.7\n%contenido');

      expect(inspectFile(pdf)).toMatchObject({
        kind: 'pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        sizeBytes: pdf.buffer.length,
      });
    });

    it('acepta un Markdown con texto UTF-8 válido', () => {
      const result = inspectFile(
        file('guia.md', '# Guía\n\nOperación básica.'),
      );

      expect(result).toMatchObject({
        kind: 'md',
        mimeType: 'text/markdown',
        extension: 'md',
      });
    });

    it('acepta un .txt con texto UTF-8 válido', () => {
      const result = inspectFile(file('notas.txt', 'Revisión anual.'));

      expect(result).toMatchObject({
        kind: 'txt',
        mimeType: 'text/plain',
        extension: 'txt',
      });
    });

    it('acepta la extensión en mayúsculas', () => {
      const result = inspectFile(file('MANUAL.PDF', '%PDF-1.4'));

      expect(result).toMatchObject({ kind: 'pdf', extension: 'pdf' });
    });

    it('calcula el SHA-256 en hexadecimal y minúsculas', () => {
      const result = inspectFile(file('abc.txt', 'abc'));

      expect(result.checksum).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });
  });

  describe('archivos rechazados con 415', () => {
    it('rechaza un .pdf que no empieza con %PDF- (extensión falsa)', () => {
      const fake = {
        ...file('manual.pdf', 'no soy un pdf'),
        mimetype: 'application/pdf',
      };

      expect(() => inspectFile(fake)).toThrow(UnsupportedMediaTypeException);
    });

    it('rechaza un .txt con bytes nulos', () => {
      expect(() => inspectFile(file('notas.txt', 'hola\0mundo'))).toThrow(
        UnsupportedMediaTypeException,
      );
    });

    it('rechaza un .txt con UTF-8 inválido', () => {
      const invalid = Buffer.from([0x68, 0x6f, 0xff, 0xfe, 0x6c, 0x61]);

      expect(() => inspectFile(file('notas.txt', invalid))).toThrow(
        UnsupportedMediaTypeException,
      );
    });

    it('rechaza un .docx', () => {
      expect(() => inspectFile(file('manual.docx', 'PK\x03\x04'))).toThrow(
        UnsupportedMediaTypeException,
      );
    });

    it('rechaza un archivo sin extensión', () => {
      expect(() => inspectFile(file('manual', '%PDF-1.7'))).toThrow(
        UnsupportedMediaTypeException,
      );
    });
  });

  describe('archivos rechazados con 400', () => {
    it('rechaza cuando no llega archivo', () => {
      expect(() => inspectFile(undefined)).toThrow(BadRequestException);
    });

    it('rechaza un archivo de 0 bytes', () => {
      expect(() => inspectFile(file('vacio.txt', Buffer.alloc(0)))).toThrow(
        BadRequestException,
      );
    });
  });
});
