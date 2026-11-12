import { unsupportedFigures } from './grounding-check';

describe('unsupportedFigures', () => {
    it('una cifra que está en el pasaje citado está respaldada', () => {
        expect(unsupportedFigures('El plazo es de 3 días hábiles [S1].', ['El plazo es de 3 días hábiles.'])).toEqual([]);
    });

    it('una cifra inventada no está respaldada', () => {
        expect(unsupportedFigures('El plazo es de 90 días [S1].', ['El plazo es de 30 días.'])).toEqual(['90']);
    });

    it('los separadores de miles y los porcentajes se comparan por valor', () => {
        expect(unsupportedFigures('Más de $100.000 [S1].', ['Diferencias mayores a $100000.'])).toEqual([]);
        expect(unsupportedFigures('Descuento del 5 % [S1].', ['Descuento del 5% sobre el total.'])).toEqual([]);
    });

    it('las marcas de cita y los números de lista no cuentan', () => {
        expect(unsupportedFigures('1. Registrá el reclamo [S1]\n2. Verificá las condiciones [S1]', ['Registrá el reclamo.'])).toEqual([]);
    });

    it('una fecha o una hora que no está en el pasaje no está respaldada', () => {
        expect(unsupportedFigures('Se hace a las 15:00 [S1].', ['Se hace a las 14:00.'])).toEqual(['15:00']);
    });
});