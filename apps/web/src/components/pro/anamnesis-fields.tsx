'use client';

import type { AnamnesisQuestion } from '@vetta/contracts';
import { uploadFile } from '@vetta/sdk';
import { useVettaClient } from '@vetta/sdk/react';
import { Button, Input, Textarea, Uploader, toast } from '@vetta/ui';
import { useRef, useState } from 'react';
import { errorMessage } from '@/lib/api';

type Value = string | number | boolean | string[] | null | undefined;

/** Assinatura desenhada no canvas; vira PNG e é enviada como documento do aluno. */
function SignaturePad({
  onSaved,
  disabled,
}: {
  onSaved: (mediaId: string) => void;
  disabled?: boolean;
}) {
  const client = useVettaClient();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * e.currentTarget.width,
      y: ((e.clientY - r.top) / r.height) * e.currentTarget.height,
    };
  };
  const save = async () => {
    const c = canvas.current;
    if (!c) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
      const id = await uploadFile(
        client,
        new File([blob], 'assinatura.png', { type: 'image/png' }),
        { purpose: 'document' },
      );
      onSaved(id);
      toast.success('Assinatura registrada.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvas}
        width={600}
        height={180}
        aria-label="Área de assinatura: desenhe com o dedo ou o mouse"
        className="w-full max-w-lg touch-none rounded-control border border-input bg-white"
        onPointerDown={(e) => {
          if (disabled) return;
          drawing.current = true;
          const ctx = e.currentTarget.getContext('2d')!;
          const p = pos(e);
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#101418';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext('2d')!;
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          setDirty(true);
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerLeave={() => (drawing.current = false)}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            canvas.current?.getContext('2d')?.clearRect(0, 0, 600, 180);
            setDirty(false);
          }}
        >
          Limpar
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!dirty || disabled}
          loading={saving}
          onClick={() => void save()}
        >
          Salvar assinatura
        </Button>
      </div>
    </div>
  );
}

/** Campo de resposta para cada tipo do construtor de anamnese. */
export function AnamnesisField({
  q,
  value,
  onChange,
  disabled,
}: {
  q: AnamnesisQuestion;
  value: Value;
  onChange: (v: Value) => void;
  disabled?: boolean;
}) {
  const client = useVettaClient();
  switch (q.type) {
    case 'yes_no':
      return (
        <div className="flex gap-2" role="radiogroup" aria-label={q.label}>
          {[true, false].map((v) => (
            <Button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={value === v}
              variant={value === v ? 'primary' : 'secondary'}
              disabled={disabled}
              onClick={() => onChange(v)}
            >
              {v ? 'Sim' : 'Não'}
            </Button>
          ))}
        </div>
      );
    case 'single_choice':
    case 'multi_choice':
      return (
        <div
          className="flex flex-wrap gap-2"
          role={q.type === 'single_choice' ? 'radiogroup' : 'group'}
          aria-label={q.label}
        >
          {(q.options ?? []).map((o) => {
            const on = Array.isArray(value) ? value.includes(o) : value === o;
            return (
              <Button
                key={o}
                type="button"
                size="sm"
                disabled={disabled}
                aria-pressed={on}
                variant={on ? 'primary' : 'secondary'}
                onClick={() => {
                  if (q.type === 'single_choice') return onChange(o);
                  const arr = Array.isArray(value) ? value : [];
                  onChange(on ? arr.filter((x) => x !== o) : [...arr, o]);
                }}
              >
                {o}
              </Button>
            );
          })}
        </div>
      );
    case 'scale': {
      const min = q.min ?? 0;
      const max = q.max ?? 10;
      return (
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={q.label}>
          {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
            <Button
              key={n}
              type="button"
              size="sm"
              disabled={disabled}
              role="radio"
              aria-checked={value === n}
              variant={value === n ? 'primary' : 'secondary'}
              className="min-w-11"
              onClick={() => onChange(n)}
            >
              {n}
            </Button>
          ))}
        </div>
      );
    }
    case 'number':
      return (
        <Input
          type="number"
          min={q.min}
          max={q.max}
          disabled={disabled}
          aria-label={q.label}
          className="max-w-40"
          value={(value as number | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    case 'date':
      return (
        <Input
          type="date"
          disabled={disabled}
          aria-label={q.label}
          className="max-w-48"
          value={(value as string | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case 'long_text':
      return (
        <Textarea
          disabled={disabled}
          aria-label={q.label}
          value={(value as string | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'upload':
      return value ? (
        <p className="text-sm text-success">Arquivo enviado.</p>
      ) : (
        <Uploader
          accept="application/pdf,image/jpeg,image/png"
          maxBytes={20 * 1024 * 1024}
          label="Enviar arquivo (PDF ou imagem)"
          upload={({ file, onProgress, signal }) =>
            uploadFile(client, file, {
              purpose: 'document',
              signal,
              onProgress: (p) => onProgress(p.ratio),
            })
          }
          onUploaded={(id) => onChange(id)}
        />
      );
    case 'signature':
      return value ? (
        <p className="text-sm text-success">Assinado.</p>
      ) : (
        <SignaturePad disabled={disabled} onSaved={(id) => onChange(id)} />
      );
    default:
      return (
        <Input
          disabled={disabled}
          aria-label={q.label}
          value={(value as string | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
