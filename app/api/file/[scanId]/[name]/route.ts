/**
 * GET /api/file/[scanId]/[name]
 *
 * Serves artifacts out of the scan directory: the original, the corrected file,
 * keyframes and the JSON exports. Two things matter here.
 *
 * 1. The artifact name is checked against a CLOSED SET before it touches the
 *    filesystem. A scan id is user-supplied and so is the name; without this,
 *    "../../.env" is a working request.
 * 2. Range requests are honoured. Without them Chrome will not let you seek a
 *    <video>, and seeking is the entire interaction this product is built on.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { NextResponse } from 'next/server';
import { ARTIFACT, scanFile } from '../../../../../src/store/paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** name -> [artifact on disk, content type]. Nothing outside this map is servable. */
const SERVABLE: Record<string, [string, string]> = {
  'input.mp4': [ARTIFACT.input, 'video/mp4'],
  'original.mp4': [ARTIFACT.input, 'video/mp4'],
  'fixed.mp4': [ARTIFACT.fixed, 'video/mp4'],
  'audio.wav': [ARTIFACT.audio, 'audio/wav'],
  'meta.json': [ARTIFACT.meta, 'application/json'],
  'transcript.json': [ARTIFACT.transcript, 'application/json'],
  'candidates.json': [ARTIFACT.candidates, 'application/json'],
  'findings.json': [ARTIFACT.findings, 'application/json'],
  'verdict.json': [ARTIFACT.verdict, 'application/json'],
  'fixplan.json': [ARTIFACT.fixplan, 'application/json'],
  'spans.json': [ARTIFACT.spans, 'application/json'],
  'diff.json': [ARTIFACT.diff, 'application/json'],
  'drops.jsonl': [ARTIFACT.drops, 'application/x-ndjson'],
  'report.json': [ARTIFACT.findings, 'application/json'],
};

const FRAME = /^frames\/(\d{3})\.jpg$/;

function resolveArtifact(name: string): [string, string] | null {
  if (SERVABLE[name]) return SERVABLE[name];
  const frame = FRAME.exec(name);
  if (frame) return [`${ARTIFACT.framesDir}/${frame[1]}.jpg`, 'image/jpeg'];
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scanId: string; name: string }> },
) {
  const { scanId, name: rawName } = await params;
  const name = decodeURIComponent(rawName);

  if (!/^[a-f0-9]{8,64}$/i.test(scanId)) {
    return NextResponse.json({ error: 'Malformed scan id.' }, { status: 400 });
  }

  const resolved = resolveArtifact(name);
  if (!resolved) {
    return NextResponse.json(
      { error: `"${name}" is not a servable artifact.`, servable: Object.keys(SERVABLE) },
      { status: 400 },
    );
  }
  const [artifact, contentType] = resolved;
  const filePath = scanFile(scanId, artifact);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: `${name} has not been produced for this scan.` }, { status: 404 });
  }

  const stat = statSync(filePath);
  const isMedia = contentType.startsWith('video/') || contentType.startsWith('audio/');
  const range = request.headers.get('range');

  const baseHeaders: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Accept-Ranges': isMedia ? 'bytes' : 'none',
  };
  if (contentType === 'video/mp4') {
    baseHeaders['Content-Disposition'] = `inline; filename="greenlight-${name}"`;
  }

  if (isMedia && range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
      if (Number.isNaN(start) || start >= stat.size || end < start) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${stat.size}` },
        });
      }
      const stream = Readable.toWeb(
        createReadStream(filePath, { start, end }),
      ) as unknown as WebReadableStream<Uint8Array>;
      return new NextResponse(stream as unknown as ReadableStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': String(end - start + 1),
        },
      });
    }
  }

  const stream = Readable.toWeb(
    createReadStream(filePath),
  ) as unknown as WebReadableStream<Uint8Array>;
  return new NextResponse(stream as unknown as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': String(stat.size) },
  });
}
