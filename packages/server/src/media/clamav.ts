import net from 'node:net';
import type { Readable } from 'node:stream';

export type ScanResult = { clean: true } | { clean: false; signature: string };

/**
 * Cliente mínimo do clamd (protocolo INSTREAM via TCP).
 * O worker envia o arquivo em blocos; o clamd responde "stream: OK" ou "... FOUND".
 */
export async function scanStream(
  stream: Readable,
  o: { host: string; port: number; timeoutMs?: number },
): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: o.host, port: o.port });
    let response = '';
    socket.setTimeout(o.timeoutMs ?? 60_000, () => {
      socket.destroy();
      reject(new Error('Timeout no ClamAV'));
    });
    socket.on('error', reject);
    socket.on('data', (d) => (response += d.toString()));
    socket.on('end', () => {
      const text = response.replace(/\0/g, '').trim();
      if (/OK$/.test(text)) resolve({ clean: true });
      else if (/FOUND$/.test(text))
        resolve({
          clean: false,
          signature: text.replace(/^stream:\s*/, '').replace(/\s*FOUND$/, ''),
        });
      else reject(new Error(`Resposta inesperada do ClamAV: ${text}`));
    });
    socket.on('connect', async () => {
      socket.write('zINSTREAM\0');
      try {
        for await (const chunk of stream) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(buf.length, 0);
          socket.write(size);
          socket.write(buf);
        }
        socket.end(Buffer.alloc(4));
      } catch (err) {
        socket.destroy();
        reject(err);
      }
    });
  });
}
