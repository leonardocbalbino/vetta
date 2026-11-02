import { describe, expect, it } from 'vitest';
import { QueueEventPublisher, queueJobId } from './events';

describe('publicador da fila', () => {
  it('id do job sem ":" (exigência do BullMQ), determinístico e sem mudar o id do evento', async () => {
    expect(queueJobId('phase:abc:1')).toBe('phase__abc__1');
    const added: { id?: string; data: { id: string } }[] = [];
    const queue = {
      add: async (_n: string, data: { id: string }, o: { jobId: string }) =>
        added.push({ id: o.jobId, data }),
    };
    const p = new QueueEventPublisher(queue as never);
    await p.publish('periodization.phase_started', { id: 'phase:123' });
    expect(added[0]).toMatchObject({ id: 'phase__123', data: { id: 'phase:123' } });
  });
});
