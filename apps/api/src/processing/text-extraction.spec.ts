import { extractText, UnsupportedFileTypeError } from './text-extraction';

describe('extractText: txt y md', () => {
    it('devuelve una sola página con el contenido del .txt', async () => {
        const pages = await extractText(Buffer.from('Paso uno\nPaso dos'), 'txt');

        expect(pages).toEqual([{ pageNumber: 1, text: 'Paso uno\nPaso dos' }]);
    });

    it('conserva los títulos del .md tal cual', async () => {
        const md = '# Ventas\n\n## Cobro\n\nEmitir la factura.';

        const pages = await extractText(Buffer.from(md), 'md');

        expect(pages[0].text).toBe(md);
    });

    it('lee UTF-8: tildes y eñes se conservan', async () => {
        const pages = await extractText(Buffer.from('Cómo cobrar a niños y señores', 'utf8'), 'txt');

        expect(pages[0].text).toBe('Cómo cobrar a niños y señores');
    });

    it('quita el BOM al inicio del archivo', async () => {
        const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Hola')]);

        const pages = await extractText(withBom, 'txt');

        expect(pages[0].text).toBe('Hola');
    });

    it('un archivo vacío devuelve una página con texto vacío', async () => {
        const pages = await extractText(Buffer.from(''), 'txt');

        expect(pages).toEqual([{ pageNumber: 1, text: '' }]);
    });

    it('rechaza un tipo que no se puede extraer', async () => {
        await expect(extractText(Buffer.from('x'), 'docx' as never)).rejects.toThrow(
            UnsupportedFileTypeError,
        );
    });
});