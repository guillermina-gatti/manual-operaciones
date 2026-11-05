import { extractText } from './text-extraction';
import { buildPdf } from './pdf-fixture';

describe('extractText: pdf', () => {
    it('devuelve una entrada por página, con su número real', async () => {
        const pdf = buildPdf(['Procedimiento de ventas', 'Paso dos de la carga']);

        const pages = await extractText(pdf, 'pdf');

        expect(pages).toHaveLength(2);
        expect(pages[0].pageNumber).toBe(1);
        expect(pages[0].text).toContain('Procedimiento de ventas');
        expect(pages[1].pageNumber).toBe(2);
        expect(pages[1].text).toContain('Paso dos de la carga');
    });

    it('un PDF de una sola página devuelve una entrada', async () => {
        const pages = await extractText(buildPdf(['Solo una pagina']), 'pdf');

        expect(pages).toHaveLength(1);
        expect(pages[0].text).toContain('Solo una pagina');
    });

    it('un buffer que no es PDF falla en vez de devolver texto basura', async () => {
        await expect(extractText(Buffer.from('esto no es un pdf'), 'pdf')).rejects.toThrow();
    });
});