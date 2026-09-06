/**
 * POST /api/fix
 *
 * { scanId, findingIds: string[], actions?: Record<findingId, Remediation> }
 * -> { plan, summary, render, rescanId }
 *
 * Builds the plan, renders one pass, then re-scans the corrected file through
 * the identical pipeline and diffs it against the parent. The re-scan runs in
 * the background exactly like the first scan, so the client polls the new id.
 */
import { NextResponse } from 'next/server';
import { renderFix } from '../../../src/pipeline/remediate/render';
import { buildFixPlan, summarizePlan } from '../../../src/pipeline/remediate/plan';
import { rescanFixed } from '../../../src/pipeline/orchestrator';
import { scanIdFor } from '../../../src/lib/hash';
import { sha256File } from '../../../src/lib/hash';
import { loadPack } from '../../../src/policy/loader';
import { ARTIFACT, scanFile } from '../../../src/store/paths';
import { loadScan, readJson } from '../../../src/store/scans';
import { finishJob, recordStage, startJob } from '../../../src/store/jobs';
import { hydrateSampleScans } from '../../../src/store/samples';
import { logger } from '../../../src/lib/logger';
import type { Finding, Remediation } from '../../../src/types/finding';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const log = logger('api:fix');

interface FixRequest {
  scanId?: string;
  findingIds?: string[];
  actions?: Record<string, Remediation>;
}

export async function POST(request: Request) {
  let body: FixRequest;
  try {
    body = (await request.json()) as FixRequest;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const { scanId, findingIds, actions } = body;
  if (!scanId) return NextResponse.json({ error: 'scanId is required.' }, { status: 400 });

  // A judge may click Apply on a baked sample before anything has been scanned
  // locally, so the committed sample scans are restored here too.
  hydrateSampleScans();

  const scan = loadScan(scanId);
  if (!scan) return NextResponse.json({ error: 'Unknown scan.' }, { status: 404 });

  const findings = readJson<Finding[]>(scanId, ARTIFACT.findings) ?? [];
  const selected = findingIds ?? [];
  if (!selected.length) {
    return NextResponse.json(
      { error: 'Nothing selected. Tick at least one finding to repair.' },
      { status: 400 },
    );
  }

  const plan = buildFixPlan(scanId, findings, selected, scan.durationMs, { actions });
  const summary = summarizePlan(plan);

  const render = await renderFix(scanId, plan, scan.durationMs);

  if (!render.rendered) {
    // Honest, not silent: the span list and any packaging suggestions were still
    // written, so the response is useful even though no file was produced.
    return NextResponse.json({
      plan,
      summary,
      render: {
        rendered: false,
        reason: render.reason,
        stderrTail: render.stderrTail ?? null,
        summary: render.summary,
      },
      rescanId: null,
    });
  }

  // Pre-compute the re-scan id so the client can start polling immediately.
  const pack = loadPack();
  const fixedPath = scanFile(scanId, ARTIFACT.fixed);
  const rescanId = scanIdFor({
    fileHash: await sha256File(fixedPath),
    packVersion: pack.version,
    title: scan.title,
    thumbHash: scan.thumbHash,
  });

  startJob(rescanId, 'fix');
  void rescanFixed(fixedPath, scanId, {
    onStage: (event) => recordStage(rescanId, event),
  })
    .then((res) => {
      log.info(`fix ${scanId} -> ${res.scan.id}: ${res.diff.summary}`);
      finishJob(rescanId);
    })
    .catch((e) => {
      log.error(`rescan failed: ${e instanceof Error ? e.message : String(e)}`);
      finishJob(rescanId, e);
    });

  return NextResponse.json({
    plan,
    summary,
    render: {
      rendered: true,
      ms: render.ms,
      summary: render.summary,
      filterComplex: render.filterComplex,
      downloadUrl: `/api/file/${scanId}/fixed.mp4`,
      spansUrl: `/api/file/${scanId}/spans.json`,
    },
    rescanId,
  });
}
