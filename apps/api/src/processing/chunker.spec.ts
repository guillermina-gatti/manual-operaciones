import { chunkPages, estimateTokens, MAX_CHUNK_TOKENS } from './chunker';

const txt = (text: string) => [{ pageNumber: 1, text }];

describe('chunkPages', () => {
    describe('párrafos y tamaño', () => {
        it('une párrafos cortos en un mismo fragmento', () => {
            const chunks = chunkPages(txt('Primer párrafo.\n\nSegundo párrafo.'), { kind: 'txt' });

            expect(chunks).toHaveLength(1);
            expect(chunks[0].content).toBe('Primer párrafo.\n\nSegundo párrafo.');
        });

        it('abre un fragmento nuevo cuando se supera el tamaño máximo', () => {
            const parrafo = 'a'.repeat(200); // 50 tokens estimados
            const text = [parrafo, parrafo, parrafo, parrafo].join('\n\n');

            const chunks = chunkPages(txt(text), { kind: 'txt', maxTokens: 120 });

            expect(chunks).toHaveLength(2);
            expect(chunks.every((c) => c.tokenCount <= 120)).toBe(true);
        });

        it('numera los fragmentos en orden desde 0', () => {
            const text = Array.from({ length: 6 }, (_, i) => `Párrafo ${i} ${'x'.repeat(300)}`).join('\n\n');

            const chunks = chunkPages(txt(text), { kind: 'txt', maxTokens: 100 });

            expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
        });

        it('ignora páginas y bloques vacíos', () => {
            const chunks = chunkPages(
                [
                    { pageNumber: 1, text: '   \n\n  ' },
                    { pageNumber: 2, text: 'Contenido.' },
                ],
                { kind: 'pdf' },
            );

            expect(chunks).toHaveLength(1);
            expect(chunks[0]).toMatchObject({ content: 'Contenido.', pageNumber: 2 });
        });

        it('corta un párrafo gigante por oraciones y no pasa del máximo', () => {
            const oracion = 'Esta es una oración de prueba para el fragmentado.';
            const gigante = Array.from({ length: 60 }, () => oracion).join(' ');

            const chunks = chunkPages(txt(gigante), { kind: 'txt', maxTokens: 100 });

            expect(chunks.length).toBeGreaterThan(1);
            expect(chunks.every((c) => c.tokenCount <= 100)).toBe(true);
            expect(chunks.map((c) => c.content).join(' ')).toContain(oracion);
        });

        it('corta una palabra interminable en trozos del tamaño máximo', () => {
            const chunks = chunkPages(txt('x'.repeat(2000)), { kind: 'txt', maxTokens: 100 });

            expect(chunks.length).toBeGreaterThan(1);
            expect(chunks.every((c) => c.tokenCount <= 100)).toBe(true);
        });

        it('usa el tamaño por defecto cuando no se indica uno', () => {
            const chunks = chunkPages(txt('Texto corto.'), { kind: 'txt' });

            expect(chunks[0].tokenCount).toBeLessThanOrEqual(MAX_CHUNK_TOKENS);
        });
    });

    describe('títulos de sección en markdown', () => {
        it('guarda el título de la sección en cada fragmento', () => {
            const md = '# Apertura\n\nAbrir la caja.\n\n## Cierre\n\nContar el efectivo.';

            const chunks = chunkPages(txt(md), { kind: 'md' });

            expect(chunks).toHaveLength(2);
            expect(chunks[0]).toMatchObject({ section: 'Apertura', content: 'Abrir la caja.' });
            expect(chunks[1]).toMatchObject({ section: 'Cierre', content: 'Contar el efectivo.' });
        });

        it('un título siempre abre un fragmento nuevo, aunque sobre espacio', () => {
            const md = 'Texto inicial.\n\n# Nueva sección\n\nTexto nuevo.';

            const chunks = chunkPages(txt(md), { kind: 'md' });

            expect(chunks).toHaveLength(2);
            expect(chunks[0].section).toBeNull();
            expect(chunks[1].section).toBe('Nueva sección');
        });

        it('no toma como título una línea que no empieza con #', () => {
            const chunks = chunkPages(txt('Esto no es # un título.'), { kind: 'md' });

            expect(chunks[0].section).toBeNull();
        });

        it('mantiene la sección cuando el texto continúa en otra página', () => {
            const chunks = chunkPages(
                [
                    { pageNumber: 1, text: '# Seguridad\n\nUsar guantes.' },
                    { pageNumber: 2, text: 'Revisar el equipo.' },
                ],
                { kind: 'pdf' },
            );

            expect(chunks).toHaveLength(2);
            expect(chunks[1]).toMatchObject({ section: 'Seguridad', pageNumber: 2 });
        });
    });

    describe('títulos en texto plano (.txt)', () => {
        it('toma como título un párrafo corto de una sola línea sin puntuación final', () => {
            const txtContent = 'Procedimiento de cierre\n\nContar el efectivo y firmar el arqueo.';

            const chunks = chunkPages(txt(txtContent), { kind: 'txt' });

            expect(chunks).toHaveLength(1);
            expect(chunks[0]).toMatchObject({
                section: 'Procedimiento de cierre',
                content: 'Contar el efectivo y firmar el arqueo.',
            });
        });

        it('no toma como título un párrafo que termina en punto', () => {
            const chunks = chunkPages(txt('Esto es una oración completa.'), { kind: 'txt' });

            expect(chunks[0].section).toBeNull();
        });

        it('no aplica la heurística de títulos a los PDF', () => {
            const chunks = chunkPages(
                [{ pageNumber: 1, text: 'Procedimiento de cierre\n\nTexto del paso.' }],
                { kind: 'pdf' },
            );

            expect(chunks[0].section).toBeNull();
        });
    });

    describe('números de página', () => {
        it('guarda la página de origen de cada fragmento', () => {
            const chunks = chunkPages(
                [
                    { pageNumber: 1, text: 'Página uno.' },
                    { pageNumber: 2, text: 'Página dos.' },
                ],
                { kind: 'pdf' },
            );

            expect(chunks.map((c) => c.pageNumber)).toEqual([1, 2]);
        });

        it('deja pageNumber en null para txt y md', () => {
            const chunks = chunkPages(txt('Texto.'), { kind: 'md' });

            expect(chunks[0].pageNumber).toBeNull();
        });

        it('no mezcla páginas en un mismo fragmento aunque entren en el tamaño', () => {
            const chunks = chunkPages(
                [
                    { pageNumber: 1, text: 'Fin de la uno.' },
                    { pageNumber: 2, text: 'Inicio de la dos.' },
                ],
                { kind: 'pdf', maxTokens: 1000 },
            );

            expect(chunks).toHaveLength(2);
        });
    });

    it('devuelve una lista vacía si no hay texto', () => {
        expect(chunkPages(txt(''), { kind: 'txt' })).toEqual([]);
    });
});

describe('estimateTokens', () => {
    it('estima alrededor de 4 caracteres por token y nunca devuelve 0', () => {
        expect(estimateTokens('abcd')).toBe(1);
        expect(estimateTokens('abcde')).toBe(2);
        expect(estimateTokens('')).toBe(1);
    });
});

describe('chunkPages no pierde texto', () => {
    it('conserva todos los caracteres de una palabra interminable', () => {
        const palabra = 'x'.repeat(2000);

        const chunks = chunkPages(txt(palabra), { kind: 'txt', maxTokens: 100 });

        expect(chunks.map((c) => c.content).join('')).toBe(palabra);
    });
});