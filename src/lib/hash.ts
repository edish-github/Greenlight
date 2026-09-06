import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export function sha256String(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function sha256Buffer(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Invariant I4: the pipeline is a pure function of
 * (file bytes, pack version, title, thumbnail).
 *
 * Same inputs => same scan id => same cached output. This is what lets the
 * three judge-mode sample clips resolve from disk with zero API calls, and
 * what makes a pack version bump invalidate every scan automatically.
 */
export function scanIdFor(input: {
  fileHash: string;
  packVersion: string;
  title?: string | null;
  thumbHash?: string | null;
}): string {
  const parts = [
    input.fileHash,
    input.packVersion,
    input.title?.trim() ?? '',
    input.thumbHash ?? '',
  ];
  return sha256String(parts.join('\u0000')).slice(0, 32);
}
