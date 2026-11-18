'use client';

import { youtubeMedia } from '@vetta/contracts';
import { Field, Input } from '@vetta/ui';

/** Vídeo do YouTube embutido (sem cookies de rastreamento até o play). */
export function YouTubeEmbed({ embedUrl, title }: { embedUrl: string; title: string }) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-card bg-muted">
      <iframe
        src={embedUrl}
        title={`Vídeo: ${title}`}
        className="size-full"
        loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

/** Campo de link do YouTube com prévia da miniatura (vira a foto do exercício). */
export function YouTubeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const yt = youtubeMedia(value);
  const invalid = !!value.trim() && !yt;
  return (
    <div className="flex flex-col gap-2">
      <Field
        label="Vídeo no YouTube (opcional)"
        hint="Cole o link do vídeo. Não ocupa seu espaço de armazenamento e a capa vira a foto do exercício."
        error={invalid ? 'Use um link do YouTube (youtube.com ou youtu.be).' : undefined}
      >
        <Input
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
      {yt ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={yt.thumbnail}
          alt="Capa do vídeo"
          className="aspect-video w-48 rounded-control object-cover"
        />
      ) : null}
    </div>
  );
}
