/**
 * GET /api/scan/[scanId]
 *
 * The polling endpoint. Returns the full report once the scan is complete, and
 * the live stage list while it is not. Never a bare spinner payload: even at
 * two seconds in, the client has demux timings and a duration to render.
 */
import { NextResponse } from 'next/server';
import { existsSync } from 'node:fs';
import { ARTIFACT, scanFile } from '../../../../src/store/paths';
import { buildReport } from '../../../../src/store/report';
import { hydrateSampleScans } from '../../../../src/store/samples';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await params;

  if (!/^[a-f0-9]{8,64}$/i.test(scanId)) {
    return NextResponse.json({ error: 'Malformed scan id.' }, { status: 400 });
  }

  // Restores committed judge-mode scans on a cold start, so a fresh clone can
  // open a sample report before anything has ever been scanned locally.
  hydrateSampleScans();

  const report = buildReport(scanId);
  if (!report) {
    return NextResponse.json({ error: 'Unknown scan.' }, { status: 404 });
  }

  report.hasFixedFile = existsSync(scanFile(scanId, ARTIFACT.fixed));

  return NextResponse.json(report, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
