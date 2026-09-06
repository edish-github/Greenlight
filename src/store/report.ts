/**
 * Assembles the payload the report screen renders.
 *
 * Everything here is read from the scan directory. The API routes stay thin
 * because assembling a report is not an HTTP concern.
 */
import { ARTIFACT } from './paths';
import { loadScan, readJson } from './scans';
import { getJob } from './jobs';
import type { Candidate, Finding } from '../types/finding';
import type { Scan } from '../types/scan';
import type { Verdict } from '../types/verdict';
import type { FixPlan } from '../types/fixplan';

export interface DiffRecord {
  parentScanId: string;
  childScanId: string;
  counts: { resolved: number; persisted: number; fresh: number; unverified: number };
  allClear: boolean;
  trustworthy: boolean;
  summary: string;
  resolvedIds: string[];
  persistedIds: string[];
  freshIds: string[];
}

export interface ReportPayload {
  scan: Scan;
  verdict: Verdict | null;
  findings: Finding[];
  candidates: Candidate[];
  fixPlan: FixPlan | null;
  diff: DiffRecord | null;
  /** Present when this scan is the re-scan of a corrected file. */
  parent: { scan: Scan; verdict: Verdict | null; findings: Finding[] } | null;
  /** Live stage list while a scan is in flight. */
  stages: { status: string; label: string; ms: number; detail: string }[];
  running: boolean;
  jobError: string | null;
  hasFixedFile: boolean;
}

export function buildReport(scanId: string): ReportPayload | null {
  const scan = loadScan(scanId);
  if (!scan) return null;

  const job = getJob(scanId);
  const diff = readJson<DiffRecord>(scanId, ARTIFACT.diff);

  let parent: ReportPayload['parent'] = null;
  if (scan.parentScanId) {
    const parentScan = loadScan(scan.parentScanId);
    if (parentScan) {
      parent = {
        scan: parentScan,
        verdict: readJson<Verdict>(scan.parentScanId, ARTIFACT.verdict),
        findings: readJson<Finding[]>(scan.parentScanId, ARTIFACT.findings) ?? [],
      };
    }
  }

  return {
    scan,
    verdict: readJson<Verdict>(scanId, ARTIFACT.verdict),
    findings: readJson<Finding[]>(scanId, ARTIFACT.findings) ?? [],
    candidates: readJson<Candidate[]>(scanId, ARTIFACT.candidates) ?? [],
    fixPlan: readJson<FixPlan>(scanId, ARTIFACT.fixplan),
    diff,
    parent,
    stages: job?.stages ?? [],
    running: Boolean(job && !job.done) || (scan.status !== 'complete' && scan.status !== 'failed'),
    jobError: job?.error ?? null,
    hasFixedFile: false, // set by the route, which can stat the filesystem
  };
}
