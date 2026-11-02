import type { UploadPurpose } from '@vetta/contracts';
import { uploadFile, xhrPut } from '@vetta/sdk';
import { client } from './client';

/**
 * Envia um arquivo local (URI da câmera, galeria ou gravador) direto ao storage
 * com URL pré-assinada; os bytes nunca passam pela API.
 */
export async function uploadUri(
  uri: string,
  input: { name: string; mime: string; purpose: UploadPurpose; studentLinkId?: string },
): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  const file = Object.assign(blob, { name: input.name });
  Object.defineProperty(file, 'type', { value: input.mime });
  return uploadFile(client, file, {
    purpose: input.purpose,
    put: xhrPut,
    ...(input.studentLinkId ? { studentLinkId: input.studentLinkId } : {}),
  });
}
