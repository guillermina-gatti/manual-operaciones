// Ayuda sobre cómo usar la plataforma: respuesta fija por tema, tolerante a errores de tipeo.
import { platformHelpReply } from './chat-help';

describe('platformHelpReply', () => {
    it('cómo ver un documento, aunque esté mal escrito', () => {
        expect(platformHelpReply('como busoc un documento')).toContain('/documentos');
        expect(platformHelpReply('Cómo veo un documento que hable de esto?')).toContain('Documentos');
        expect(platformHelpReply('donde encuentro los manuales')).toContain('/documentos');
    });

    it('cómo cargar un documento', () => {
        expect(platformHelpReply('¿Cómo subo un documento?')).toContain('/documentos/nuevo');
        expect(platformHelpReply('quiero cargar un manual nuevo')).toContain('administrador');
    });

    it('cómo ejecutar un procedimiento', () => {
        expect(platformHelpReply('como hago un procedimiento')).toContain('/ejecuciones');
        expect(platformHelpReply('donde veo mis tareas')).toContain('/ejecuciones');
    });

    it('métricas, avisos de revisión y uso del asistente', () => {
        expect(platformHelpReply('donde veo las métricas')).toContain('/metricas');
        expect(platformHelpReply('como se que un documento vencio')).toContain('/documentos');
        expect(platformHelpReply('como funciona el asistente')).toContain('/asistente');
    });

    it('una consulta sobre el contenido de los documentos no es ayuda', () => {
        expect(platformHelpReply('cual es el plazo de devolucion')).toBeNull();
        expect(platformHelpReply('como se hace el cierre de caja')).toBeNull();
        expect(platformHelpReply('documentos')).toBeNull();
    });

    it('un mensaje largo se busca en los documentos', () => {
        const long = 'como veo en el documento de ventas el procedimiento para aprobar una devolucion de un cliente corporativo';
        expect(platformHelpReply(long)).toBeNull();
    });

    it('vacío o sin intención', () => {
        expect(platformHelpReply('')).toBeNull();
        expect(platformHelpReply('documento de ventas')).toBeNull();
    });
});

describe('platformHelpReply · falsos positivos', () => {
    it('"versión" no cuenta como "ver"', () => {
        expect(platformHelpReply('ultima version del documento')).toBeNull();
    });
});

describe('platformHelpReply · documentos visibles, estados y citas', () => {
    it('qué documentos puedo ver y por qué falta uno', () => {
        expect(platformHelpReply('que documentos tengo')).toContain('vigentes de tus áreas');
        expect(platformHelpReply('por que no veo un documento')).toContain('vigentes de tus áreas');
        expect(platformHelpReply('no me aparece el manual')).toContain('vigentes de tus áreas');
    });

    it('qué significa cada estado', () => {
        expect(platformHelpReply('que significa pendiente')).toContain('Con error');
        expect(platformHelpReply('cuando esta listo mi documento')).toContain('"Listo"');
        expect(platformHelpReply('que quiere decir procesando')).toContain('Procesando');
    });

    it('de dónde sale la información', () => {
        expect(platformHelpReply('de donde sacas esto')).toContain('qué documento');
        expect(platformHelpReply('como se si es confiable')).toContain('qué documento');
    });

    it('no se pisa con consultas de contenido', () => {
        expect(platformHelpReply('como soluciono un error de caja')).toBeNull();
        expect(platformHelpReply('cual es la fuente de ingresos')).toBeNull();
        expect(platformHelpReply('no tengo el comprobante del cliente')).toBeNull();
    });
});


describe('platformHelpReply · "ayuda" y preguntas con "lo"', () => {
    it('"ayuda" sola muestra el menú de temas', () => {
        expect(platformHelpReply('ayuda')).toContain('Puedo ayudarte con');
        expect(platformHelpReply('¡Ayudame!')).toContain('Puedo ayudarte con');
    });

    it('"ayuda" con más palabras es una consulta, no el menú', () => {
        expect(platformHelpReply('ayuda con el cierre de caja de ventas')).toBeNull();
    });

    it('"¿cómo lo cargo?" responde cómo cargar un documento', () => {
        expect(platformHelpReply('como lo cargo?')).toContain('/documentos/nuevo');
        expect(platformHelpReply('¿Dónde lo subo?')).toContain('/documentos/nuevo');
    });

    it('"¿dónde lo veo?" responde cómo ver documentos', () => {
        expect(platformHelpReply('donde lo veo')).toContain('/documentos');
    });

    it('una pregunta de contenido con "cargar" no es ayuda', () => {
        expect(platformHelpReply('como cargo la caja registradora')).toBeNull();
        expect(platformHelpReply('como lo cargo en el sistema de ventas')).toBeNull();
    });
});
