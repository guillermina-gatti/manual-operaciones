// Verificación de cifras: cada número, porcentaje, monto, fecha u hora de la respuesta tiene que aparecer en
// los pasajes citados. Si alguno no aparece, la respuesta puede tener un dato inventado o cambiado, y no se
// muestra. Es una comprobación simple y determinística: no mide si la respuesta es correcta en general,
// solo que sus cifras existen en el texto citado.

// Cifras: 3, 150.000, 5%, 3,5, 14:00, 01/03/2026.
const FIGURE = /\d+(?:[.,:/]\d+)*%?/g;

// Lo que no son datos: las marcas de cita [S1] y el número de una línea de lista ("1. Registrá...").
function dataText(text: string): string {
    return text
        .replace(/\s+%/g, '%')
        .replace(/\[S\d+\]/g, ' ')
        .split('\n')
        .map((line) => line.replace(/^\s*\d+[.)]\s+/, ''))
        .join('\n');
}

// Forma comparable de una cifra: sin separador de miles y con punto como decimal ("150.000" = "150000", "3,5" = "3.5").
export function canonicalFigure(token: string): string {
    return token.replace(/(\d)\.(?=\d{3}(?!\d))/g, '$1').replace(',', '.');
}

function figuresIn(text: string): string[] {
    return (text.replace(/\s+%/g, '%').match(FIGURE) ?? []).map(canonicalFigure);
}

// Las cifras de la respuesta que no aparecen en ninguno de los pasajes citados. Vacío = todo respaldado.
export function unsupportedFigures(answer: string, citedPassages: string[]): string[] {
    const source = new Set(citedPassages.flatMap((passage) => figuresIn(passage)));
    return [...new Set(figuresIn(dataText(answer)))].filter((figure) => !source.has(figure));
}