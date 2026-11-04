// Spec 009 (T04, R8): el enlace a la búsqueda sin IA. La misma tabla está en la web
// (apps/web/tests/lib/chat/search-url.test.ts): si cambia una, cambia la otra.
import { buildSearchUrl } from './chat-search-url';

const LONG_WITH_SPACES = Array.from({ length: 300 }, (_, i) => `palabra${i}`).join(' ');

describe('buildSearchUrl (spec 009, R8)', () => {
    it.each([
        ['¿Cómo cierro la caja?', '/documentos?q=%C2%BFC%C3%B3mo%20cierro%20la%20caja%3F'],
        ['  caja \n diaria  ', '/documentos?q=caja%20diaria'],
        ['ok', '/documentos'],
        ['  a  ', '/documentos'],
        ['a&b #1', '/documentos?q=a%26b%20%231'],
        ['abc', '/documentos?q=abc'],
    ])('%j → %s', (question, url) => {
        expect(buildSearchUrl(question)).toBe(url);
    });

    it('una pregunta larga con espacios se corta en un espacio, con 100 caracteres como mucho', () => {
        const url = buildSearchUrl(LONG_WITH_SPACES);
        const text = decodeURIComponent(url.replace('/documentos?q=', ''));

        expect(text.length).toBeLessThanOrEqual(100);
        expect(LONG_WITH_SPACES.startsWith(`${text} `)).toBe(true);
    });

    it('una pregunta de 150 caracteres sin espacios queda en los primeros 100', () => {
        const question = 'x'.repeat(150);

        expect(buildSearchUrl(question)).toBe(`/documentos?q=${'x'.repeat(100)}`);
    });

    it('exactamente 100 caracteres no se corta', () => {
        const question = `${'a'.repeat(49)} ${'b'.repeat(50)}`;

        expect(buildSearchUrl(question)).toBe(`/documentos?q=${encodeURIComponent(question)}`);
    });
});
