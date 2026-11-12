import { NoSuchKey, S3Client } from '@aws-sdk/client-s3';
import {
  StorageUnavailableError,
  StoredFileNotFoundError,
} from './file-storage';
import { S3FileStorage } from './s3-file-storage';

const KEY = 'documents/doc-1/version-1.pdf';

describe('S3FileStorage', () => {
  let storage: S3FileStorage;
  let send: jest.SpyInstance;

  beforeEach(() => {
    // Cliente simulado: ningún test sale a la red
    send = jest.spyOn(S3Client.prototype, 'send');
    storage = new S3FileStorage({
      bucket: 'bucket-de-test',
      region: 'us-east-1',
      forcePathStyle: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('get pide el objeto al bucket y devuelve el cuerpo como Buffer', async () => {
    send.mockResolvedValue({
      Body: {
        transformToByteArray: () =>
          Promise.resolve(new TextEncoder().encode('%PDF-1.7')),
      },
    });

    const content = await storage.get(KEY);

    expect(content).toEqual(Buffer.from('%PDF-1.7'));
    expect(Buffer.isBuffer(content)).toBe(true);
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: 'bucket-de-test',
      Key: KEY,
    });
  });

  it('get con una clave inexistente (NoSuchKey) lanza StoredFileNotFoundError', async () => {
    send.mockRejectedValue(
      new NoSuchKey({
        message: 'The specified key does not exist.',
        $metadata: {},
      }),
    );

    await expect(storage.get(KEY)).rejects.toThrow(StoredFileNotFoundError);
  });

  it('get lanza StorageUnavailableError si S3 no responde', async () => {
    send.mockRejectedValue(new Error('connect ETIMEDOUT'));

    await expect(storage.get(KEY)).rejects.toThrow(StorageUnavailableError);
  });

  it('get lanza StorageUnavailableError si S3 responde sin cuerpo', async () => {
    send.mockResolvedValue({});

    await expect(storage.get(KEY)).rejects.toThrow(StorageUnavailableError);
  });
});
