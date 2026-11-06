// HU18: citas verificables. Cada fuente que va en la respuesta trae un enlace firmado al archivo de su
// versión; si la firma falla, la fuente queda sin enlace y la respuesta sale igual.
import { DownloadUrl, FileStorage, StorageUnavailableError } from '../storage/file-storage';
import { withSignedLinks } from './chat-links';
import { NO_INFO_TEXT, toSources, type Outcome } from './chat-pipeline';
import { ChatService } from './chat.service';
import { ChatStreamService } from './chat-stream.service';
import { FakeEmbeddings, FakeLlm, FakeRepository, FakeRetrieval, RecordingSink, USER, chunk } from './testing/chat-fakes';

const MANUAL = { storageKey: 'documents/d1/v1.pdf', fileName: 'manual-caja.pdf' };
const signedUrl = (key: string) => `https://signed.example/${key}`;

// Un almacenamiento que firma enlaces y registra cada pedido. failFor: claves cuya firma falla.
class FakeStorage extends FileStorage {
    signed: Array<{ key: string; fileName: string }> = [];
    constructor(private readonly failFor: string[] = []) {
        super();
    }
    async put(): Promise<void> {
        return undefined;
    }
    async get(): Promise<Buffer> {
        return Buffer.alloc(0);
    }
    async delete(): Promise<void> {
        return undefined;
    }
    async getDownloadUrl(key: string, fileName: string): Promise<DownloadUrl> {
        this.signed.push({ key, fileName });
        if (this.failFor.includes(key)) throw new StorageUnavailableError('S3 down');
        return { url: signedUrl(key), expiresAt: new Date(0) };
    }
}

describe('HU18 · withSignedLinks', () => {
    it('firma el enlace de cada fuente con su clave y su nombre de archivo', async () => {
        const storage = new FakeStorage();
        const outcome: Outcome = {
            status: 'answered',
            answer: 'El plazo es 5 días [S1].',
            chunks: [chunk({ chunkId: 'a', ...MANUAL })],
        };

        const signed = await withSignedLinks(storage, outcome, { warn: jest.fn() });

        expect(signed.chunks[0].url).toBe(signedUrl(MANUAL.storageKey));
        expect(storage.signed).toEqual([{ key: MANUAL.storageKey, fileName: MANUAL.fileName }]);
    });

    it('sin almacenamiento, el resultado queda igual', async () => {
        const outcome: Outcome = { status: 'answered', answer: 'Sí [S1].', chunks: [chunk(MANUAL)] };

        expect(await withSignedLinks(undefined, outcome, { warn: jest.fn() })).toBe(outcome);
    });

    it('sin fuentes no firma nada', async () => {
        const storage = new FakeStorage();
        const outcome: Outcome = { status: 'no_info', answer: NO_INFO_TEXT, chunks: [] };

        expect(await withSignedLinks(storage, outcome, { warn: jest.fn() })).toBe(outcome);
        expect(storage.signed).toEqual([]);
    });

    it('una fuente sin clave de archivo queda sin enlace y no se firma', async () => {
        const storage = new FakeStorage();
        const outcome: Outcome = { status: 'answered', answer: 'Sí [S1].', chunks: [chunk({ chunkId: 'a' })] };

        const signed = await withSignedLinks(storage, outcome, { warn: jest.fn() });

        expect(signed.chunks[0].url).toBeUndefined();
        expect(storage.signed).toEqual([]);
    });

    it('si una firma falla, las demás salen firmadas, la fallida queda sin enlace y se registra', async () => {
        const warn = jest.fn();
        const storage = new FakeStorage(['documents/d2/v1.pdf']);
        const outcome: Outcome = {
            status: 'answered',
            answer: 'Ver [S1] y [S2].',
            chunks: [
                chunk({ chunkId: 'a', ...MANUAL }),
                chunk({ chunkId: 'b', storageKey: 'documents/d2/v1.pdf', fileName: 'gastos.pdf' }),
            ],
        };

        const signed = await withSignedLinks(storage, outcome, { warn });

        expect(signed.chunks[0].url).toBe(signedUrl(MANUAL.storageKey));
        expect(signed.chunks[1].url).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('No se pudo firmar el enlace de la fuente b'));
    });

    it('en una contradicción, los dos fragmentos del conflicto llevan el enlace', async () => {
        const storage = new FakeStorage();
        const first = chunk({ chunkId: 'a', ...MANUAL });
        const second = chunk({ chunkId: 'b', storageKey: 'documents/d2/v1.pdf', fileName: 'gastos.pdf' });
        const outcome: Outcome = {
            status: 'conflict',
            answer: 'Gerente [S1]; director [S2].',
            chunks: [first, second],
            conflict: { first, second },
        };

        const signed = await withSignedLinks(storage, outcome, { warn: jest.fn() });

        expect(signed.conflict?.first.url).toBe(signedUrl(MANUAL.storageKey));
        expect(signed.conflict?.second.url).toBe(signedUrl('documents/d2/v1.pdf'));
    });
});

describe('HU18 · toSources', () => {
    it('usa el enlace firmado cuando existe, y vacío si no', () => {
        const [withLink, withoutLink] = toSources([
            chunk({ chunkId: 'a', url: signedUrl('k') }),
            chunk({ chunkId: 'b' }),
        ]);

        expect(withLink.url).toBe(signedUrl('k'));
        expect(withoutLink.url).toBe('');
    });
});

describe('HU18 · POST /api/chat (ChatService)', () => {
    it('la fuente citada en la respuesta trae su enlace firmado', async () => {
        const storage = new FakeStorage();
        const service = new ChatService(
            new FakeEmbeddings(),
            new FakeRetrieval([chunk({ distance: 0.1, ...MANUAL })]),
            new FakeLlm(['El plazo es 5 días [S1].']),
            new FakeRepository(),
            undefined,
            undefined,
            undefined,
            storage,
        );

        const result = await service.ask(USER, { message: '¿plazo?' });

        expect(result.status).toBe('answered');
        expect(result.sources[0].url).toBe(signedUrl(MANUAL.storageKey));
    });

    it('si el almacenamiento falla, la respuesta sale igual con la fuente sin enlace', async () => {
        const service = new ChatService(
            new FakeEmbeddings(),
            new FakeRetrieval([chunk({ distance: 0.1, ...MANUAL })]),
            new FakeLlm(['El plazo es 5 días [S1].']),
            new FakeRepository(),
            undefined,
            undefined,
            undefined,
            new FakeStorage([MANUAL.storageKey]),
        );

        const result = await service.ask(USER, { message: '¿plazo?' });

        expect(result.status).toBe('answered');
        expect(result.sources[0].url).toBe('');
    });
});

describe('HU18 · POST /api/chat/stream (ChatStreamService)', () => {
    it('el done trae el enlace firmado de la fuente citada', async () => {
        const service = new ChatStreamService(
            new FakeEmbeddings(),
            new FakeRetrieval([chunk({ distance: 0.1, ...MANUAL })]),
            new FakeLlm(['El plazo es ', '5 días [S1].']),
            new FakeRepository(),
            undefined,
            undefined,
            undefined,
            new FakeStorage(),
        );
        const sink = new RecordingSink();
        const opened = await service.open(USER, { message: '¿plazo?' });

        await service.run(USER, opened, sink, new AbortController().signal);

        expect(sink.final?.sources[0].url).toBe(signedUrl(MANUAL.storageKey));
    });
});