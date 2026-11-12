// Listado de documentos por área: detección de la pregunta, área nombrada y formato de la respuesta.
import { areaNamed, formatAreaChoice, formatAreas, formatCatalog, isAreasQuestion, isCatalogQuestion, isDocumentChoiceQuestion, isDocumentsOfAreaQuestion, isShortQuestion, NO_CATALOG_TEXT } from './chat-catalog';

describe('isCatalogQuestion', () => {
    it.each([
        'documentos de cada área',
        '¿qué documentos hay en cada área?',
        'lista los documentos de todas las áreas',
        'cuáles son los documentos por área',
        'mostrame los manuales de cada area',
    ])('listado: %s', (question) => {
        expect(isCatalogQuestion(question)).toBe(true);
    });

    it.each([
        'documentos de ventas',
        'documentos del area ventas',
        'lista de áreas',
        '¿cuál es el plazo de devolución en el área de ventas?',
        'cómo busco un documento',
    ])('no es listado de todas las áreas: %s', (question) => {
        expect(isCatalogQuestion(question)).toBe(false);
    });
});

describe('isDocumentsOfAreaQuestion y areaNamed', () => {
    const areas = ['Ventas', 'Operaciones', 'Ventas Mayoristas'];

    it('"documentos de ventas" pide los de esa área', () => {
        expect(isDocumentsOfAreaQuestion('documentos de ventas')).toBe(true);
        expect(areaNamed('documentos de ventas', areas)).toBe('Ventas');
        expect(areaNamed('documento de operaciones', areas)).toBe('Operaciones');
    });

    it('el área más larga gana cuando hay dos que coinciden', () => {
        expect(areaNamed('documentos de ventas mayoristas', areas)).toBe('Ventas Mayoristas');
    });

    it('sin área nombrada, o con una que no existe, no es un listado de área', () => {
        expect(areaNamed('documentos de compras', areas)).toBeNull();
        expect(areaNamed('documentos de ventasx', areas)).toBeNull();
    });

    it('una pregunta larga sobre el contenido no es listado', () => {
        expect(
            isDocumentsOfAreaQuestion('documentos de ventas sobre devoluciones de un cliente corporativo grande'),
        ).toBe(false);
    });
});

describe('formatCatalog', () => {
    it('muestra un bloque por área con documentos y omite las vacías', () => {
        const text = formatCatalog([
            { areaName: 'Ventas', titles: ['Cotizaciones', 'Devoluciones'] },
            { areaName: 'Compras', titles: [] },
        ]);
        expect(text).toBe('Ventas (2):\n- Cotizaciones\n- Devoluciones');
    });

    it('sin documentos, dice que no hay nada para mostrar', () => {
        expect(formatCatalog([])).toBe(NO_CATALOG_TEXT);
    });
});

describe('isAreasQuestion y formatAreas', () => {
    it('"area" sola o con palabras de relleno pregunta por las áreas', () => {
        expect(isAreasQuestion('area')).toBe(true);
        expect(isAreasQuestion('areas')).toBe(true);
        expect(isAreasQuestion('que areas tengo')).toBe(true);
    });

    it('con un área nombrada o con documentos, no es la pregunta de áreas', () => {
        expect(isAreasQuestion('area de ventas')).toBe(false);
        expect(isAreasQuestion('documentos de ventas')).toBe(false);
    });

    it('lista las áreas con documentos, con "y" antes de la última', () => {
        expect(
            formatAreas([
                { areaName: 'Operaciones', titles: ['Despacho'] },
                { areaName: 'Ventas', titles: ['Cotizaciones'] },
            ]),
        ).toBe(
            'Tenés acceso a 2 áreas: Operaciones y Ventas. Preguntame por los documentos de cada una, por ejemplo "documentos de Operaciones".',
        );
    });

    it('sin áreas con documentos, dice que no hay nada para mostrar', () => {
        expect(formatAreas([])).toBe(NO_CATALOG_TEXT);
    });
});

describe('isShortQuestion y área sola', () => {
    it('una o dos palabras es corta, una frase larga no', () => {
        expect(isShortQuestion('ventas')).toBe(true);
        expect(isShortQuestion('documentos de ventas')).toBe(true);
        expect(isShortQuestion('cuál es el plazo de devolución de un cliente')).toBe(false);
    });

    it('el nombre de un área sola se reconoce como área nombrada', () => {
        expect(areaNamed('ventas', ['Ventas', 'Operaciones'])).toBe('Ventas');
        expect(areaNamed('operaciones', ['Ventas', 'Operaciones'])).toBe('Operaciones');
        expect(areaNamed('cotizaciones', ['Ventas', 'Operaciones'])).toBeNull();
    });
});

describe('isDocumentChoiceQuestion (pedido vago: preguntar el área)', () => {
    it.each(['documento', 'documentos', 'doc', 'docs', 'archivo', 'archivos', 'manual', 'mas o menos algo con doc', 'quiero ver archivos', 'documentos de area', '¿qué documentos tengo?'])(
        'pide elegir área: %s',
        (question) => {
            expect(isDocumentChoiceQuestion(question)).toBe(true);
        },
    );

    it.each(['documentos de ventas', 'ventas', 'cómo busco un documento', 'cuál es el plazo de devolución', 'documentos sobre devoluciones'])(
        'no es pedido vago: %s',
        (question) => {
            expect(isDocumentChoiceQuestion(question)).toBe(false);
        },
    );
});

describe('formatAreaChoice', () => {
    it('pregunta el área entre las que tienen documentos, con "o" antes de la última', () => {
        expect(
            formatAreaChoice([
                { areaName: 'Ventas', titles: ['Condiciones comerciales'] },
                { areaName: 'Operaciones', titles: ['Despacho'] },
                { areaName: 'Administración', titles: [] },
            ]),
        ).toBe('¿De qué área querés ver los documentos: Ventas o Operaciones?');
    });

    it('sin documentos en ninguna área, dice que no hay nada para mostrar', () => {
        expect(formatAreaChoice([])).toBe(NO_CATALOG_TEXT);
    });
});