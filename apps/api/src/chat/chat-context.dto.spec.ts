// Spec 010 (T01, R2): la forma del contexto del paso, en el DTO de las dos rutas.
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatRequestDto } from './chat.dto';

const VERSION = '0e000000-0000-4000-8000-000000000001';
const STEP = '0f000000-0000-4000-8000-000000000001';

async function errorsOf(body: object): Promise<string[]> {
    const errors = await validate(plainToInstance(ChatRequestDto, body), { whitelist: true });
    const flatten = (list: typeof errors, prefix = ''): string[] =>
        list.flatMap((e) => [
            ...Object.keys(e.constraints ?? {}).map(() => `${prefix}${e.property}`),
            ...flatten(e.children ?? [], `${prefix}${e.property}.`),
        ]);
    return flatten(errors);
}

describe('ChatRequestDto.context (spec 010, R2)', () => {
    it('sin context, pasa', async () => {
        expect(await errorsOf({ message: 'hola' })).toEqual([]);
    });

    it('con los dos UUID, pasa', async () => {
        expect(await errorsOf({ message: 'hola', context: { procedureVersionId: VERSION, stepId: STEP } })).toEqual([]);
    });

    it('sin stepId, falla en context.stepId', async () => {
        expect(await errorsOf({ message: 'hola', context: { procedureVersionId: VERSION } })).toContain('context.stepId');
    });

    it('un id que no es UUID falla en ese campo', async () => {
        expect(
            await errorsOf({ message: 'hola', context: { procedureVersionId: 'abc', stepId: STEP } }),
        ).toContain('context.procedureVersionId');
    });

    it('{} falla en los dos campos', async () => {
        const errors = await errorsOf({ message: 'hola', context: {} });

        expect(errors).toEqual(expect.arrayContaining(['context.procedureVersionId', 'context.stepId']));
    });

    it('un context que no es un objeto falla', async () => {
        expect(await errorsOf({ message: 'hola', context: 'paso-3' })).toContain('context');
    });
});
