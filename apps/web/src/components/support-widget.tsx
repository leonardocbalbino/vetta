'use client';

import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABEL } from '@vetta/contracts';
import {
  Button,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
  Textarea,
} from '@vetta/ui';
import { LifeBuoy } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApiMutation } from '@/lib/api';

export interface TicketSummary {
  id: string;
  number: number;
  subject: string;
  status: 'OPEN' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED';
  priority: string;
  updatedAt: string;
  firstResponseDueAt: string;
  firstRespondedAt: string | null;
}

export const TICKET_STATUS: Record<
  TicketSummary['status'],
  { label: string; variant: 'warning' | 'success' | 'outline' | 'neutral' }
> = {
  OPEN: { label: 'aguardando a Vetta', variant: 'warning' },
  WAITING_USER: { label: 'respondido', variant: 'success' },
  RESOLVED: { label: 'resolvido', variant: 'outline' },
  CLOSED: { label: 'encerrado', variant: 'neutral' },
};

/** Formulário de chamado (página de suporte e widget). Envia a página atual junto. */
export function SupportForm({ onDone }: { onDone?: () => void }) {
  const path = usePathname();
  const router = useRouter();
  const [f, setF] = useState({
    subject: '',
    category: 'other' as (typeof SUPPORT_CATEGORIES)[number],
    body: '',
  });
  const create = useApiMutation<object, { id: string; number: number }>(
    'POST',
    '/v1/support/tickets',
    {
      invalidate: ['/v1/support/tickets'],
      success: 'Chamado aberto. Avisaremos quando respondermos.',
      onSuccess: (t) => {
        setF({ subject: '', category: 'other', body: '' });
        onDone?.();
        router.push(`/suporte/${t.id}`);
      },
    },
  );
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({ ...f, pageUrl: path });
      }}
    >
      <Field label="Assunto">
        <Input
          required
          minLength={4}
          maxLength={160}
          value={f.subject}
          onChange={(e) => setF({ ...f, subject: e.target.value })}
        />
      </Field>
      <Field label="Tema">
        <Select
          value={f.category}
          onValueChange={(v) => setF({ ...f, category: v as typeof f.category })}
        >
          <SelectTrigger aria-label="Tema">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {SUPPORT_CATEGORY_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Conte o que aconteceu">
        <Textarea
          required
          minLength={10}
          rows={5}
          value={f.body}
          onChange={(e) => setF({ ...f, body: e.target.value })}
        />
      </Field>
      <Button type="submit" loading={create.isPending} className="self-start">
        Enviar chamado
      </Button>
    </form>
  );
}

/** Botão flutuante de suporte para o personal e a equipe. */
export function SupportWidget() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          variant="action"
          aria-label="Falar com o suporte"
          className="fixed bottom-20 right-4 z-30 size-12 rounded-full shadow-lg md:bottom-6"
        >
          <LifeBuoy aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetTitle>Precisa de ajuda?</SheetTitle>
        <SheetDescription>
          Consulte a{' '}
          <a
            className="text-link underline"
            href="https://vettafit.com.br/ajuda"
            target="_blank"
            rel="noreferrer"
          >
            central de ajuda
          </a>{' '}
          ou abra um chamado. Respondemos no prazo do seu plano.
        </SheetDescription>
        <div className="mt-4">
          <SupportForm onDone={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
