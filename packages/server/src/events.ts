import { randomUUID } from 'node:crypto';
import type { DomainEvent, DomainEventName } from '@vetta/contracts';
import type { Queue } from 'bullmq';
import { DEFAULT_JOB_OPTIONS } from './queues';

export interface PublishInput {
  tenantId?: string | null;
  actorId?: string | null;
  payload?: Record<string, unknown>;
  /** Id determinístico para idempotência (opcional). */
  id?: string;
}

export function createDomainEvent(name: DomainEventName, input: PublishInput = {}): DomainEvent {
  return {
    id: input.id ?? randomUUID(),
    name,
    tenantId: input.tenantId ?? null,
    actorId: input.actorId ?? null,
    occurredAt: new Date().toISOString(),
    payload: input.payload ?? {},
  };
}

export interface EventPublisher {
  publish(name: DomainEventName, input?: PublishInput): Promise<DomainEvent>;
}

/**
 * O BullMQ recusa ':' em ids customizados. O id do evento continua o mesmo (idempotência
 * nas notificações); só o id do job na fila troca ':' por '__', de forma determinística.
 */
export const queueJobId = (eventId: string) => eventId.replaceAll(':', '__');

/** Publica eventos de domínio na fila consumida pelo worker (NotificationService). */
export class QueueEventPublisher implements EventPublisher {
  constructor(
    private readonly queue: Queue,
    private readonly onPublish?: (e: DomainEvent) => void,
  ) {}

  async publish(name: DomainEventName, input: PublishInput = {}) {
    const event = createDomainEvent(name, input);
    await this.queue.add(name, event, { ...DEFAULT_JOB_OPTIONS, jobId: queueJobId(event.id) });
    this.onPublish?.(event);
    return event;
  }
}

/** Publicador em memória (testes). */
export class MemoryEventPublisher implements EventPublisher {
  readonly events: DomainEvent[] = [];
  async publish(name: DomainEventName, input: PublishInput = {}) {
    const e = createDomainEvent(name, input);
    this.events.push(e);
    return e;
  }
  of(name: DomainEventName) {
    return this.events.filter((e) => e.name === name);
  }
}
