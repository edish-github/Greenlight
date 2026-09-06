/**
 * POST /api/scan
 *
 * multipart/form-data: file (required), title, thumbnail
 * -> { scanId, cached, status }
 *
 * Returns as soon as the scan id is known and runs the pipeline in the
 * background. The client polls GET /api/scan/[scanId] and renders the stage
 * list. A 20-second held-open request is the wrong shape for this, and a
 * spinner is the wrong shape for the UI.
 */
import { NextResponse } from 'next/server';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runScan } from '../../../src/pipeline/orchestrator';
import { loadPack } from '../../../src/policy/loader';
import { scanIdFor, sha256Buffer } from '../../../src/lib/hash';
import { lookup } from '../../../src/store/cache';
import { finishJob, recordStage, startJob } from '../../../src/store/jobs';
import { logger } from '../../../src/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const log = logger('api:scan');

const MAX_BYTES = 500 * 1024 * 1024;
const ALLOWED = ['.mp4', '.mov', '.mkv', '.webm', '.m4v'];

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded. Attach one as "file".' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1e6).toFixed(0)}MB. The limit is 500MB.` },
      { status: 413 },
    );
  }
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED.includes(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type "${ext || 'none'}". Use ${ALLOWED.join(', ')}.` },
      { status: 415 },
    );
  }

  const title = (form.get('title') as string | null)?.trim() || null;
  const thumbnail = form.get('thumbnail');

  const bytes = Buffer.from(await file.arrayBuffer());
  const workDir = mkdtempSync(path.join(tmpdir(), 'greenlight-upload-'));
  const inputPath = path.join(workDir, `input${ext}`);
  writeFileSync(inputPath, bytes);

  let thumbnailPath: string | null = null;
  let thumbHash: string | null = null;
  if (thumbnail instanceof File && thumbnail.size > 0) {
    const thumbBytes = Buffer.from(await thumbnail.arrayBuffer());
    thumbnailPath = path.join(workDir, `thumb${path.extname(thumbnail.name) || '.jpg'}`);
    writeFileSync(thumbnailPath, thumbBytes);
    thumbHash = sha256Buffer(thumbBytes);
  }

  // The scan id is a pure function of the inputs, so it is known before any
  // work happens. That is what makes returning immediately possible.
  const pack = loadPack();
  const scanId = scanIdFor({ fileHash: sha256Buffer(bytes), packVersion: pack.version, title, thumbHash });

  const cached = lookup(scanId, pack.version);
  if (cached.hit) {
    rmSync(workDir, { recursive: true, force: true });
    log.info(`cache hit ${scanId} - zero external calls`);
    return NextResponse.json({ scanId, cached: true, status: 'complete' });
  }

  startJob(scanId, 'scan');
  void runScan({
    inputPath,
    title,
    thumbnailPath,
    onStage: (event) => recordStage(scanId, event),
  })
    .then(() => finishJob(scanId))
    .catch((e) => {
      log.error(`scan ${scanId} failed: ${e instanceof Error ? e.message : String(e)}`);
      finishJob(scanId, e);
    })
    .finally(() => rmSync(workDir, { recursive: true, force: true }));

  return NextResponse.json({ scanId, cached: false, status: 'queued' }, { status: 202 });
}
