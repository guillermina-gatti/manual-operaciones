import { QueueUnavailableError } from '../ports/processing-queue';
import { FakeProcessingQueue } from './fake-processing-queue';

describe('FakeProcessingQueue', () => {
  let queue: FakeProcessingQueue;

  beforeEach(() => {
    queue = new FakeProcessingQueue();
  });

  it('enqueue guarda el id de la versión', async () => {
    await queue.enqueue('v1');

    expect(queue.enqueued).toEqual(['v1']);
  });

  it('con failNext rechaza con QueueUnavailableError y no guarda nada', async () => {
    queue.failNext();

    await expect(queue.enqueue('v1')).rejects.toThrow(QueueUnavailableError);
    expect(queue.enqueued).toEqual([]);
  });

  it('failNext afecta solo a la llamada siguiente', async () => {
    queue.failNext();
    await expect(queue.enqueue('v1')).rejects.toThrow(QueueUnavailableError);

    await queue.enqueue('v2');

    expect(queue.enqueued).toEqual(['v2']);
  });
});
