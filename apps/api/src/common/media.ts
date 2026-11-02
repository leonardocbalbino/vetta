import { SIGNED_URL_TTL_SECONDS } from '@vetta/contracts';
import type { StorageProvider } from '@vetta/server';

interface MediaLike {
  storageKey: string;
  variants: unknown;
  fileName?: string;
}

/** URL assinada (15 min) da melhor variante disponível (webp para imagens). */
export async function signedMediaUrl(
  storage: StorageProvider,
  m: MediaLike,
  variant: 'webp' | 'thumbnail' | 'original' = 'webp',
): Promise<string> {
  const v = (m.variants ?? {}) as Record<string, { key?: string } | undefined>;
  const key =
    variant === 'original' ? m.storageKey : (v[variant]?.key ?? v.webp?.key ?? m.storageKey);
  return storage.presignGet(key, SIGNED_URL_TTL_SECONDS);
}
