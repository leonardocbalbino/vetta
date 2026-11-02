'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Switch,
} from '@vetta/ui';
import { MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApi, useApiMutation } from '@/lib/api';

/** Opt-in de WhatsApp (registrado em consents); sem ele, nada é enviado pelo canal. */
export function WhatsAppCard() {
  const status = useApi<{ optedIn: boolean; phone: string | null }>('/v1/integrations/whatsapp');
  const [phone, setPhone] = useState('');
  useEffect(() => setPhone(status.data?.phone ?? ''), [status.data]);
  const save = useApiMutation<object>('PUT', '/v1/integrations/whatsapp', {
    invalidate: ['/v1/integrations/whatsapp'],
    success: 'Preferência salva.',
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="size-5" aria-hidden /> Avisos no WhatsApp
        </CardTitle>
        <CardDescription>
          Cobranças, lembretes de treino e de aula pelo WhatsApp oficial. Nada é enviado entre 22h e
          7h.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field label="Seu WhatsApp" hint="Formato +5511999999999">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <div className="flex items-center gap-3">
          <Switch
            id="wa-optin"
            checked={!!status.data?.optedIn}
            onCheckedChange={(v) => save.mutate({ granted: v, ...(v && phone ? { phone } : {}) })}
          />
          <label htmlFor="wa-optin">Quero receber avisos pelo WhatsApp</label>
        </div>
      </CardContent>
    </Card>
  );
}
