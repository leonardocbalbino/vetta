'use client';

import { CheckCircle2, CloudUpload, RotateCcw, X, XCircle } from 'lucide-react';
import { useCallback, useId, useRef, useState, type DragEvent } from 'react';
import { cn } from '../utils.js';
import { Button } from './button.js';

export interface UploadHandlerArgs {
  file: File;
  onProgress: (ratio: number) => void;
  signal: AbortSignal;
  /** Upload criado antes (retomada após cair a conexão ou recarregar a página). */
  resumeMediaId?: string;
  /** Guarda o id para retomar depois. */
  onCreated?: (mediaId: string) => void;
}

export interface UploaderProps {
  /** Normalmente: (a) => uploadFile(client, a.file, { purpose, ...a }) do @vetta/sdk. */
  upload: (args: UploadHandlerArgs) => Promise<string>;
  accept?: string;
  maxBytes?: number;
  multiple?: boolean;
  label?: string;
  hint?: string;
  onUploaded?: (mediaId: string, file: File) => void;
  className?: string;
}

type Item = {
  id: string;
  file: File;
  ratio: number;
  status: 'uploading' | 'done' | 'error' | 'canceled';
  error?: string;
  mediaId?: string;
};

const resumeKey = (f: File) => `vetta:upload:${f.name}:${f.size}:${f.lastModified}`;

/** Upload com arrastar e soltar, progresso, cancelamento e retomada (multipart). */
export function Uploader({
  upload,
  accept,
  maxBytes,
  multiple,
  label = 'Arraste arquivos ou clique para enviar',
  hint,
  onUploaded,
  className,
}: UploaderProps) {
  const inputId = useId();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());

  const patch = (id: string, p: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const start = useCallback(
    async (file: File, existingId?: string) => {
      const id = existingId ?? `${Date.now()}-${Math.random()}`;
      if (maxBytes && file.size > maxBytes) {
        setItems((l) => [
          ...l,
          {
            id,
            file,
            ratio: 0,
            status: 'error',
            error: `Arquivo maior que ${Math.round(maxBytes / 1048576)} MB.`,
          },
        ]);
        return;
      }
      const ctrl = new AbortController();
      controllers.current.set(id, ctrl);
      if (existingId) patch(id, { status: 'uploading', error: undefined });
      else setItems((l) => [...l, { id, file, ratio: 0, status: 'uploading' }]);
      const saved =
        typeof localStorage !== 'undefined' ? localStorage.getItem(resumeKey(file)) : null;
      try {
        const mediaId = await upload({
          file,
          signal: ctrl.signal,
          onProgress: (ratio) => patch(id, { ratio }),
          ...(saved ? { resumeMediaId: saved } : {}),
          onCreated: (m) => localStorage.setItem(resumeKey(file), m),
        });
        localStorage.removeItem(resumeKey(file));
        patch(id, { status: 'done', ratio: 1, mediaId });
        onUploaded?.(mediaId, file);
      } catch (err) {
        const canceled = (err as Error).name === 'AbortError';
        patch(id, {
          status: canceled ? 'canceled' : 'error',
          error: canceled ? 'Envio cancelado.' : (err as Error).message,
        });
      } finally {
        controllers.current.delete(id);
      }
    },
    [upload, maxBytes, onUploaded],
  );

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files).slice(0, multiple ? undefined : 1)) void start(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    onFiles(e.dataTransfer.files);
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-input p-6 text-center',
          'focus-within:outline-2 focus-within:outline-ring hover:bg-muted/50',
          dragging && 'border-action bg-action/5',
        )}
      >
        <CloudUpload className="size-8 text-muted-foreground" aria-hidden />
        <span className="font-semibold">{label}</span>
        {hint ? <span className="text-sm text-muted-foreground">{hint}</span> : null}
        <input
          id={inputId}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>

      {items.length ? (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {items.map((i) => (
            <li
              key={i.id}
              className="flex items-center gap-3 rounded-control border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.file.name}</p>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(i.ratio * 100)}
                  aria-label={`Progresso de ${i.file.name}`}
                >
                  <div
                    className={cn(
                      'h-full transition-all',
                      i.status === 'error' ? 'bg-danger' : 'bg-action',
                    )}
                    style={{ width: `${i.ratio * 100}%` }}
                  />
                </div>
                {i.error ? <p className="mt-1 text-sm text-danger">{i.error}</p> : null}
              </div>
              {i.status === 'uploading' ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Cancelar envio"
                  onClick={() => controllers.current.get(i.id)?.abort()}
                >
                  <X />
                </Button>
              ) : i.status === 'done' ? (
                <CheckCircle2 className="size-6 text-success" aria-label="Enviado" />
              ) : (
                <div className="flex items-center gap-1">
                  <XCircle className="size-5 text-danger" aria-hidden />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Tentar de novo"
                    onClick={() => void start(i.file, i.id)}
                  >
                    <RotateCcw />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
