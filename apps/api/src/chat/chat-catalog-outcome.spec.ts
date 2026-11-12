// Flujo de punta a punta del listado por área: "documentos" pide el área, "ventas" lista esa área.
// Se prueba catalogOutcome con un catálogo falso, sin base de datos ni modelo.
import type { Logger } from '@nestjs/common';
import type { CatalogGroup } from './chat-catalog';
import { catalogOutcome } from './chat-catalog-outcome';
import { NO_INFO_TEXT, UNAVAILABLE_TEXT, type ChatUser } from './chat-pipeline';
import { ChatDocumentsCatalog } from './ports/chat-documents-catalog';

const GROUPS: CatalogGroup[] = [
    { areaName: 'Ventas', titles: ['Condiciones comerciales', 'Cotizaciones'] },
    { areaName: 'Operaciones', titles: ['Despacho'] },
    { areaName: 'Administración', titles: [] },
];

class FakeCatalog extends ChatDocumentsCatalog {
    scopes: (string[] | null)[] = [];
    constructor(private readonly groups: CatalogGroup[] = GROUPS, private readonly fail = false) {
        super();
    }
    async listByArea(areaIds: string[] | null): Promise<CatalogGroup[]> {
        this.scopes.push(areaIds);
        if (this.fail) throw new Error('db caída');
        if (areaIds === null) return this.groups;
        return this.groups.filter((group) => areaIds.includes(group.areaName));
    }
}

const logger: Pick<Logger, 'warn'> = { warn: () => undefined };
const ADMIN: ChatUser = { id: 'admin', areaIds: [], role: 'ADMIN' };
const OPERATOR: ChatUser = { id: 'op', areaIds: ['Ventas', 'Operaciones'], role: 'OPERATOR' };
const SINGLE_AREA: ChatUser = { id: 'v', areaIds: ['Ventas'], role: 'OPERATOR' };
const NO_AREAS: ChatUser = { id: 'none', areaIds: [], role: 'OPERATOR' };

// Un paso de la conversación: lo que escribe la persona y lo que responde el asistente.
async function ask(catalog: ChatDocumentsCatalog, user: ChatUser, question: string): Promise<string | null> {
    const outcome = await catalogOutcome(catalog, user, question, logger);
    return outcome === null ? null : outcome.answer;
}

describe('flujo de punta a punta: pedir documentos, elegir el área y ver el listado', () => {
    it('"documentos" no busca: pregunta de qué área querés verlos', async () => {
        const answer = await ask(new FakeCatalog(), OPERATOR, 'documentos');
        expect(answer).toBe('¿De qué área querés ver los documentos: Ventas o Operaciones?');
    });

    it('después de la pregunta, "ventas" lista solo los documentos de Ventas', async () => {
        const catalog = new FakeCatalog();
        await ask(catalog, OPERATOR, 'documentos');
        const answer = await ask(catalog, OPERATOR, 'ventas');
        expect(answer).toBe('Ventas (2):\n- Condiciones comerciales\n- Cotizaciones');
    });

    it('"operaciones" lista solo los de Operaciones', async () => {
        const answer = await ask(new FakeCatalog(), OPERATOR, 'operaciones');
        expect(answer).toBe('Operaciones (1):\n- Despacho');
    });

    it('la forma vaga del pedido también pregunta el área: "más o menos algo con doc"', async () => {
        const answer = await ask(new FakeCatalog(), OPERATOR, 'más o menos algo con doc');
        expect(answer).toBe('¿De qué área querés ver los documentos: Ventas o Operaciones?');
    });

    it('"archivos" y "doc" también preguntan el área', async () => {
        const catalog = new FakeCatalog();
        expect(await ask(catalog, OPERATOR, 'archivos')).toBe('¿De qué área querés ver los documentos: Ventas o Operaciones?');
        expect(await ask(catalog, OPERATOR, 'doc')).toBe('¿De qué área querés ver los documentos: Ventas o Operaciones?');
    });
});

describe('alcance por usuario', () => {
    it('un usuario con una sola área ve la pregunta solo con esa área', async () => {
        const answer = await ask(new FakeCatalog(), SINGLE_AREA, 'documentos');
        expect(answer).toBe('Ventas (2):\n- Condiciones comerciales\n- Cotizaciones');
    });

    it('un usuario no ve un área fuera de su alcance aunque la nombre', async () => {
        const catalog = new FakeCatalog();
        const answer = await ask(catalog, SINGLE_AREA, 'operaciones');
        expect(answer).toBeNull();
        expect(catalog.scopes).toEqual([['Ventas']]);
    });

    it('ADMIN ve todas las áreas en la pregunta', async () => {
        const catalog = new FakeCatalog();
        const answer = await ask(catalog, ADMIN, 'documentos');
        expect(answer).toBe('¿De qué área querés ver los documentos: Ventas o Operaciones?');
        expect(catalog.scopes).toEqual([null]);
    });

    it('un usuario sin áreas recibe la respuesta de no hay información, sin consultar el catálogo', async () => {
        const catalog = new FakeCatalog();
        const outcome = await catalogOutcome(catalog, NO_AREAS, 'documentos', logger);
        expect(outcome).toEqual({ status: 'no_info', answer: NO_INFO_TEXT, chunks: [] });
        expect(catalog.scopes).toEqual([]);
    });

    it('si solo hay documentos en una área, lista esa área directo sin preguntar', async () => {
        const catalog = new FakeCatalog([
            { areaName: 'Ventas', titles: ['Cotizaciones'] },
            { areaName: 'Operaciones', titles: [] },
        ]);
        const answer = await ask(catalog, OPERATOR, 'documentos');
        expect(answer).toBe('Ventas (1):\n- Cotizaciones');
    });

    it('sin documentos en ninguna área, avisa que no hay nada para mostrar', async () => {
        const catalog = new FakeCatalog([{ areaName: 'Ventas', titles: [] }]);
        const answer = await ask(catalog, OPERATOR, 'documentos');
        expect(answer).toBe('No hay documentos vigentes para mostrar en tus áreas.');
    });
});

describe('lo que no es un listado sigue a la búsqueda', () => {
    it('una pregunta de contenido no la responde el listado', async () => {
        expect(await ask(new FakeCatalog(), OPERATOR, 'cuál es el plazo de devolución de un cliente')).toBeNull();
    });

    it('"cómo busco un documento" va a la búsqueda normal', async () => {
        expect(await ask(new FakeCatalog(), OPERATOR, 'cómo busco un documento')).toBeNull();
    });

    it('"documentos de ventas sobre devoluciones" va a la búsqueda normal', async () => {
        expect(await ask(new FakeCatalog(), OPERATOR, 'documentos de ventas sobre devoluciones de un cliente')).toBeNull();
    });

    it('sin catálogo configurado, no responde el listado', async () => {
        const outcome = await catalogOutcome(undefined, OPERATOR, 'documentos', logger);
        expect(outcome).toBeNull();
    });
});

describe('errores', () => {
    it('si falla la lectura del catálogo, responde que el asistente no está disponible', async () => {
        const outcome = await catalogOutcome(new FakeCatalog(GROUPS, true), OPERATOR, 'documentos', logger);
        expect(outcome).toEqual({ status: 'ai_unavailable', answer: UNAVAILABLE_TEXT, chunks: [] });
    });
});