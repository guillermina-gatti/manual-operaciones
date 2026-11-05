// Spec 010 (T02, T03): el contexto del paso. Quién puede consultar sobre qué paso (R3, R4), con las
// reglas de procedimientos (spec 006), y una conversación por paso (R7).
import { BadRequestException, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
    CONVERSATION_OTHER_STEP,
    STEP_NOT_AVAILABLE,
    type StepRecord,
    decideAccess,
    openStepContext,
    rememberConversationStep,
} from './chat-context';
import type { ConversationStep } from './ports/chat-context-store';

const VENTAS = 'area-ventas';
const OPERACIONES = 'area-operaciones';

function record(overrides: {
    status?: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
    versionNumber?: number;
    stepVersionId?: string;
    noStep?: boolean;
    areaIds?: string[];
    versions?: StepRecord['versions'];
    description?: string;
    stepTitle?: string;
    procedureTitle?: string;
} = {}): StepRecord {
    const versionNumber = overrides.versionNumber ?? 2;
    const status = overrides.status ?? 'PUBLISHED';
    return {
        version: {
            id: 'version-2',
            procedureId: 'procedure-1',
            versionNumber,
            status,
            title: overrides.procedureTitle ?? 'Cierre de caja',
        },
        step: overrides.noStep
            ? null
            : {
                  id: 'step-3',
                  procedureVersionId: overrides.stepVersionId ?? 'version-2',
                  stepOrder: 3,
                  title: overrides.stepTitle ?? 'Contar el efectivo',
                  description: overrides.description ?? 'Contá billetes y monedas.',
              },
        procedureAreaIds: overrides.areaIds ?? [VENTAS],
        versions: overrides.versions ?? [{ versionNumber, status, stepCount: 4 }],
    };
}

const employee = { role: 'EMPLOYEE' as const, areaIds: [VENTAS] };
const admin = { role: 'ADMIN' as const, areaIds: [] };
const noExecution = jest.fn(async () => false);

describe('decideAccess (spec 010, R3, R4)', () => {
    beforeEach(() => noExecution.mockClear());

    it('la vigente, con un área en común: el contexto, sin consultar la ejecución', async () => {
        const context = await decideAccess(employee, record(), noExecution);

        expect(context).toEqual({
            procedureVersionId: 'version-2',
            stepId: 'step-3',
            procedureTitle: 'Cierre de caja',
            stepOrder: 3,
            stepTitle: 'Contar el efectivo',
            stepDescription: 'Contá billetes y monedas.',
        });
        expect(noExecution).not.toHaveBeenCalled();
    });

    it('E8: un paso de otra versión es null', async () => {
        expect(await decideAccess(admin, record({ stepVersionId: 'version-1' }), noExecution)).toBeNull();
    });

    it('sin registro o sin paso es null', async () => {
        expect(await decideAccess(admin, null, noExecution)).toBeNull();
        expect(await decideAccess(admin, record({ noStep: true }), noExecution)).toBeNull();
    });

    it('E9: sin un área en común es null', async () => {
        expect(await decideAccess(employee, record({ areaIds: [OPERACIONES] }), noExecution)).toBeNull();
    });

    it('la vigente sin pasos es null (spec 006, R13)', async () => {
        const r = record({ versions: [{ versionNumber: 2, status: 'PUBLISHED', stepCount: 0 }] });

        expect(await decideAccess(employee, r, noExecution)).toBeNull();
    });

    describe('E10: una versión reemplazada', () => {
        const superseded = record({
            versionNumber: 1,
            status: 'SUPERSEDED',
            versions: [
                { versionNumber: 1, status: 'SUPERSEDED', stepCount: 4 },
                { versionNumber: 2, status: 'PUBLISHED', stepCount: 4 },
            ],
        });

        it('con una ejecución en curso propia: el contexto', async () => {
            const hasExecution = jest.fn(async () => true);

            expect(await decideAccess(employee, superseded, hasExecution)).not.toBeNull();
            expect(hasExecution).toHaveBeenCalledTimes(1);
        });

        it('sin ejecución en curso: null', async () => {
            expect(await decideAccess(employee, superseded, noExecution)).toBeNull();
        });

        it('sin un área en común, ni se consulta la ejecución', async () => {
            const hasExecution = jest.fn(async () => true);
            const otherArea = { ...superseded, procedureAreaIds: [OPERACIONES] };

            expect(await decideAccess(employee, otherArea, hasExecution)).toBeNull();
            expect(hasExecution).not.toHaveBeenCalled();
        });
    });

    it('E11: un DRAFT es del ADMIN; para un EMPLOYEE, null', async () => {
        const draft = record({
            versionNumber: 3,
            status: 'DRAFT',
            versions: [
                { versionNumber: 2, status: 'PUBLISHED', stepCount: 4 },
                { versionNumber: 3, status: 'DRAFT', stepCount: 4 },
            ],
        });

        expect(await decideAccess(admin, draft, noExecution)).not.toBeNull();
        expect(await decideAccess(employee, draft, noExecution)).toBeNull();
    });

    it('el ADMIN ve cualquier versión, sin área en común', async () => {
        expect(await decideAccess(admin, record({ areaIds: [OPERACIONES] }), noExecution)).not.toBeNull();
    });

    it('R6: los títulos se recortan a 200 y la descripción a 2.000; sin descripción, vacío', async () => {
        const long = await decideAccess(
            admin,
            record({ procedureTitle: 'p'.repeat(250), stepTitle: 't'.repeat(250), description: 'd'.repeat(2500) }),
            noExecution,
        );

        expect(long?.procedureTitle).toHaveLength(200);
        expect(long?.stepTitle).toHaveLength(200);
        expect(long?.stepDescription).toHaveLength(2000);
        expect((await decideAccess(admin, record({ description: '   ' }), noExecution))?.stepDescription).toBe('');
    });
});


// T03: con el store (simulado acá; el de Prisma se prueba en la integración).
describe('openStepContext y rememberConversationStep (spec 010, R3 a R5, R7)', () => {
    const VERSION = 'version-2';
    const STEP = 'step-3';
    const user = { id: 'user-1', role: 'EMPLOYEE' as const, areaIds: [VENTAS] };

    function storeWith(opts: {
        record?: StepRecord | null;
        conversation?: ConversationStep | null | undefined;
        fail?: boolean;
    } = {}) {
        return {
            findStep: jest.fn(async (): Promise<StepRecord | null> => {
                if (opts.fail) throw new Error('db down');
                return opts.record === undefined ? record() : opts.record;
            }),
            hasInProgressExecution: jest.fn(async () => false),
            findConversationStep: jest.fn(async () => opts.conversation),
            setConversationStep: jest.fn(async () => undefined),
        };
    }

    afterEach(() => jest.restoreAllMocks());

    it('R9: sin contexto ni conversationId no consulta nada', async () => {
        const store = storeWith();

        await expect(openStepContext(store, user, { message: 'hola' })).resolves.toBeUndefined();
        expect(store.findStep).not.toHaveBeenCalled();
        expect(store.findConversationStep).not.toHaveBeenCalled();
    });

    it('con contexto válido, el StepContext', async () => {
        const store = storeWith();

        const context = await openStepContext(store, user, {
            message: 'hola',
            context: { procedureVersionId: VERSION, stepId: STEP },
        });

        expect(context).toMatchObject({ procedureVersionId: VERSION, stepId: STEP, stepTitle: 'Contar el efectivo' });
        expect(store.findStep).toHaveBeenCalledWith(VERSION, STEP);
    });

    it('R3: un paso que no está, 404 "El paso no está disponible"', async () => {
        const store = storeWith({ record: null });

        await expect(
            openStepContext(store, user, { message: 'hola', context: { procedureVersionId: VERSION, stepId: STEP } }),
        ).rejects.toEqual(new NotFoundException(STEP_NOT_AVAILABLE));
    });

    it('R5: si la base no responde, 503', async () => {
        const store = storeWith({ fail: true });
        jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

        await expect(
            openStepContext(store, user, { message: 'hola', context: { procedureVersionId: VERSION, stepId: STEP } }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('la ejecución en curso se consulta con el usuario y la versión', async () => {
        const superseded = record({
            versionNumber: 1,
            status: 'SUPERSEDED',
            versions: [
                { versionNumber: 1, status: 'SUPERSEDED', stepCount: 4 },
                { versionNumber: 2, status: 'PUBLISHED', stepCount: 4 },
            ],
        });
        const store = storeWith({ record: superseded });
        store.hasInProgressExecution.mockResolvedValue(true);

        await openStepContext(store, user, { message: 'hola', context: { procedureVersionId: VERSION, stepId: STEP } });

        expect(store.hasInProgressExecution).toHaveBeenCalledWith('user-1', VERSION);
    });

    describe('E12: una conversación por paso', () => {
        const sameStep = { procedureVersionId: VERSION, stepId: STEP };
        const context = { procedureVersionId: VERSION, stepId: STEP };

        it.each([
            ['con otro paso', { procedureVersionId: VERSION, stepId: 'step-4' }, context],
            ['con paso, y el pedido sin contexto', sameStep, undefined],
            ['sin paso, y el pedido con contexto', null, context],
        ])('%s: 400 "La conversación es de otro paso"', async (_name, stored, requestContext) => {
            const store = storeWith({ conversation: stored });

            await expect(
                openStepContext(store, user, { message: 'hola', conversationId: 'conv-1', context: requestContext }),
            ).rejects.toEqual(new BadRequestException(CONVERSATION_OTHER_STEP));
            expect(store.findStep).not.toHaveBeenCalled();
        });

        it('con el mismo paso, sigue', async () => {
            const store = storeWith({ conversation: sameStep });

            await expect(
                openStepContext(store, user, { message: 'hola', conversationId: 'conv-1', context }),
            ).resolves.toMatchObject({ stepId: STEP });
            expect(store.findConversationStep).toHaveBeenCalledWith('user-1', 'conv-1');
        });

        it('sin paso y sin contexto, sigue (como hoy)', async () => {
            const store = storeWith({ conversation: null });

            await expect(
                openStepContext(store, user, { message: 'hola', conversationId: 'conv-1' }),
            ).resolves.toBeUndefined();
        });

        it('una conversación que no es del usuario no se decide acá: la rechaza después resolveConversation', async () => {
            const store = storeWith({ conversation: undefined });

            await expect(
                openStepContext(store, user, { message: 'hola', conversationId: 'conv-ajena', context }),
            ).resolves.toMatchObject({ stepId: STEP });
        });
    });

    it('sin store y con contexto, 503; sin store ni contexto, nada (los tests de ChatService)', async () => {
        await expect(
            openStepContext(undefined, user, { message: 'hola', context: { procedureVersionId: VERSION, stepId: STEP } }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
        await expect(
            openStepContext(undefined, user, { message: 'hola', conversationId: 'conv-1' }),
        ).resolves.toBeUndefined();
    });

    describe('E4: rememberConversationStep', () => {
        const stepContext = {
            procedureVersionId: VERSION,
            stepId: STEP,
            procedureTitle: 'Cierre de caja',
            stepOrder: 3,
            stepTitle: 'Contar el efectivo',
            stepDescription: '',
        };

        it('una conversación nueva con contexto guarda el paso', async () => {
            const store = storeWith();

            await rememberConversationStep(store, { message: 'hola' }, 'conv-new', stepContext);

            expect(store.setConversationStep).toHaveBeenCalledWith('conv-new', { procedureVersionId: VERSION, stepId: STEP });
        });

        it('una conversación que ya existía, o sin contexto, no escribe', async () => {
            const store = storeWith();

            await rememberConversationStep(store, { message: 'hola', conversationId: 'conv-1' }, 'conv-1', stepContext);
            await rememberConversationStep(store, { message: 'hola' }, 'conv-new', undefined);

            expect(store.setConversationStep).not.toHaveBeenCalled();
        });
    });
});
