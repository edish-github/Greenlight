/**
 * The single place stages are sequenced and timed.
 *
 * One file to read to understand the whole flow. Stage implementations live
 * elsewhere; this file only orders them, times them, records degraded states
 * and writes artifacts.
 *
 * Data only ever moves downward:
 *   ingest -> evidence -> candidates -> the Gate -> scoring
 */
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { sha256File, scanIdFor } from '../lib/hash';
import { logger } from '../lib/logger';
import type { ToolInvoker } from '../lib/llm';
import { loadPack } from '../policy/loader';
import type { LoadedPack } from '../policy/types';
import { ARTIFACT, ensureScanDir, scanFile } from '../store/paths';
import { lookup } from '../store/cache';
import { loadScan, readJson, saveScan, writeJson } from '../store/scans';
import type { DegradedFlag, Scan, ScanStatus } from '../types/scan';
import type { Candidate, Finding } from '../types/finding';
import type { Transcript } from '../types/transcript';
import type { Verdict } from '../types/verdict';
import { probe } from './extract/probe';
import { extractAudio } from './extract/audio';
import { transcribe } from './transcribe';
import { detect } from './detect';
import { adjudicate } from './adjudicate/adjudicate';
import { scoreVerdict } from './score/verdict';
import { diffFindings, type ScanDiff } from './remediate/diff';
import type { RevenueInputs } from './score/revenue';

const log = logger('orchestrator');

export interface ScanOptions {
  inputPath: string;
  title?: string | null;
  thumbnailPath?: string | null;
  thumbnailText?: string | null;
  parentScanId?: string;
  packPath?: string;
  /** Skip the Gate. Detection still runs, and the report says so. */
  skipAdjudication?: boolean;
  /** Injected in tests and in the precompute script. */
  invoke?: ToolInvoker;
  revenueInputs?: RevenueInputs;
  /** Ignore a cache hit and recompute. Used when re-baking sample scans. */
  force?: boolean;
  onStage?: (event: StageEvent) => void;
}

export interface StageEvent {
  status: ScanStatus;
  label: string;
  ms: number;
  detail: string;
}

export interface RescanResult extends ScanReport {
  diff: ScanDiff;
  parentScanId: string;
  parentVerdict: Verdict | null;
}

export interface ScanReport {
  scan: Scan;
  transcript: Transcript | null;
  candidates: Candidate[];
  findings: Finding[];
  verdict: Verdict;
  cached: boolean;
}

export async function runScan(opts: ScanOptions): Promise<ScanReport> {
  const pack: LoadedPack = loadPack(opts.packPath);
  const started = Date.now();
  const timings: Record<string, number> = {};
  const degraded: DegradedFlag[] = [];

  const emit = (status: ScanStatus, label: string, ms: number, detail: string) => {
    timings[status] = ms;
    opts.onStage?.({ status, label, ms, detail });
    log.info(`${label} - ${(ms / 1000).toFixed(2)}s - ${detail}`);
  };

  if (!existsSync(opts.inputPath)) {
    throw new Error(`Input file not found: ${opts.inputPath}`);
  }

  // --- identity ------------------------------------------------------------
  const fileHash = await sha256File(opts.inputPath);
  const thumbHash = opts.thumbnailPath ? await sha256File(opts.thumbnailPath) : null;
  const scanId = scanIdFor({
    fileHash,
    packVersion: pack.version,
    title: opts.title ?? null,
    thumbHash,
  });

  // --- cache ---------------------------------------------------------------
  if (!opts.force) {
    const cached = lookup(scanId, pack.version);
    if (cached.hit && cached.scan) {
      log.info(`cache hit ${scanId} (${cached.reason})`);
      return {
        scan: cached.scan,
        transcript: readJson<Transcript>(scanId, ARTIFACT.transcript),
        candidates: readJson<Candidate[]>(scanId, ARTIFACT.candidates) ?? [],
        findings: readJson<Finding[]>(scanId, ARTIFACT.findings) ?? [],
        verdict: readJson<Verdict>(scanId, ARTIFACT.verdict)!,
        cached: true,
      };
    }
  }

  ensureScanDir(scanId);
  if (path.resolve(opts.inputPath) !== path.resolve(scanFile(scanId, ARTIFACT.input))) {
    copyFileSync(opts.inputPath, scanFile(scanId, ARTIFACT.input));
  }

  let scan: Scan = {
    id: scanId,
    createdAt: new Date().toISOString(),
    status: 'queued',
    packVersion: pack.version,
    packId: pack.pack.pack.id,
    durationMs: 0,
    sourceName: path.basename(opts.inputPath),
    fileHash,
    title: opts.title ?? null,
    thumbHash,
    degraded,
    timings,
    counts: { words: 0, candidates: 0, findings: 0, drops: 0 },
    parentScanId: opts.parentScanId,
  };
  saveScan(scan);

  try {
    // --- stage 1: ingest ---------------------------------------------------
    let t0 = Date.now();
    scan.status = 'demuxing';
    const probed = await probe(scanFile(scanId, ARTIFACT.input));
    scan.probe = probed;
    scan.durationMs = probed.durationMs;

    const audioPath = scanFile(scanId, ARTIFACT.audio);
    if (probed.hasAudio) {
      await extractAudio(scanFile(scanId, ARTIFACT.input), audioPath);
    }
    emit(
      'demuxing',
      'Demuxed',
      Date.now() - t0,
      `${(probed.durationMs / 1000).toFixed(1)}s duration, audio ${probed.hasAudio ? 'yes' : 'no'}`,
    );
    saveScan(scan);

    // --- stage 2: evidence -------------------------------------------------
    t0 = Date.now();
    scan.status = 'transcribing';
    let transcript: Transcript | null = null;
    if (probed.hasAudio) {
      const asr = await transcribe(audioPath);
      transcript = asr.transcript;
      degraded.push(...asr.degraded);
      if (transcript) writeJson(scanId, ARTIFACT.transcript, transcript);
      emit(
        'transcribing',
        'Transcribed',
        Date.now() - t0,
        transcript
          ? `${transcript.words.length} words via ${asr.provider}`
          : 'unavailable - continuing with packaging only',
      );
    } else {
      degraded.push('asr_unavailable');
      emit('transcribing', 'Transcribed', 0, 'no audio track');
    }
    scan.counts.words = transcript?.words.length ?? 0;
    saveScan(scan);

    // Vision arrives on Day 4. Until then the flag is honest rather than absent.
    degraded.push('visual_unavailable');

    // --- stage 3: candidates ----------------------------------------------
    t0 = Date.now();
    scan.status = 'detecting';
    const detected = detect({
      transcript,
      pack,
      title: opts.title,
      thumbnailText: opts.thumbnailText,
    });
    writeJson(scanId, ARTIFACT.candidates, detected.candidates);
    scan.counts.candidates = detected.candidates.length;
    emit(
      'detecting',
      'Candidates',
      Date.now() - t0,
      `${detected.candidates.length} spans ${JSON.stringify(detected.byDetector)}` +
        (detected.obscuredCount ? ` (${detected.obscuredCount} already obscured, not raised)` : ''),
    );
    saveScan(scan);

    // --- stage 4: the Gate -------------------------------------------------
    t0 = Date.now();
    scan.status = 'adjudicating';
    let findings: Finding[] = [];
    if (opts.skipAdjudication) {
      degraded.push('adjudication_unavailable');
      emit('adjudicating', 'Adjudicated', 0, 'skipped (--no-llm): candidates only, no findings');
    } else {
      const gate = await adjudicate({
        scanId,
        candidates: detected.candidates,
        pack,
        transcript,
        durationMs: scan.durationMs,
        dropsPath: scanFile(scanId, ARTIFACT.drops),
        invoke: opts.invoke,
      });
      findings = gate.findings;
      scan.counts.findings = findings.length;
      scan.counts.drops = gate.drops.count;
      writeJson(scanId, ARTIFACT.findings, findings);
      emit(
        'adjudicating',
        'Adjudicated',
        Date.now() - t0,
        `${findings.length} findings, ${gate.clearedCandidates} cleared, ${gate.drops.count} dropped ` +
          `${JSON.stringify(gate.drops.byReason())}, ${gate.calls} calls`,
      );
    }
    saveScan(scan);

    // --- stage 5: scoring --------------------------------------------------
    t0 = Date.now();
    scan.status = 'scoring';
    const verdict = scoreVerdict(findings, {
      revenueInputs: opts.revenueInputs,
      degradedCount: degraded.length,
    });
    writeJson(scanId, ARTIFACT.verdict, verdict);
    emit('scoring', 'Scored', Date.now() - t0, `${verdict.status} / confidence ${verdict.confidence}`);

    scan.status = 'complete';
    scan.degraded = [...new Set(degraded)];
    scan.timings.total = Date.now() - started;
    scan = saveScan(scan);

    return { scan, transcript, candidates: detected.candidates, findings, verdict, cached: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    scan.status = 'failed';
    scan.error = { stage: scan.status, message };
    scan.degraded = [...new Set(degraded)];
    saveScan(scan);
    log.error(`scan ${scanId} failed: ${message}`);
    throw e;
  }
}

/**
 * Re-scan a corrected file and diff it against its parent.
 *
 * The corrected file goes through the IDENTICAL pipeline under a new hash. No
 * special case, no shortcut, no "we know what we fixed so skip it". That is the
 * whole proof: if the re-scan came from anywhere other than the same code path,
 * a green timeline would prove nothing at all.
 */
export async function rescanFixed(
  fixedPath: string,
  parentScanId: string,
  opts: Omit<ScanOptions, 'inputPath' | 'parentScanId'> = {},
): Promise<RescanResult> {
  const parent = loadScan(parentScanId);
  if (!parent) throw new Error(`Unknown parent scan ${parentScanId}`);
  if (!existsSync(fixedPath)) throw new Error(`Corrected file not found: ${fixedPath}`);

  const parentFindings = readJson<Finding[]>(parentScanId, ARTIFACT.findings) ?? [];

  const child = await runScan({
    ...opts,
    inputPath: fixedPath,
    title: opts.title !== undefined ? opts.title : parent.title,
    parentScanId,
  });

  const diff = diffFindings(parentFindings, child.findings, child.scan.degraded);

  // The child report shows persisted and new findings. Resolved items are kept
  // on the record, greyed out, rather than deleted - the creator should be able
  // to see what the fix actually removed.
  // When the re-scan could not verify, the parent's findings are carried over
  // untouched so the corrected report shows the same work still outstanding.
  const carried: Finding[] = diff.trustworthy ? [] : parentFindings.filter((f) => f.state !== 'dismissed');
  const merged: Finding[] = [...diff.persisted, ...diff.fresh, ...diff.resolved, ...carried].sort(
    (a, b) => a.startMs - b.startMs || a.clauseId.localeCompare(b.clauseId),
  );
  writeJson(child.scan.id, ARTIFACT.findings, merged);

  const verdict = scoreVerdict(merged, {
    revenueInputs: opts.revenueInputs,
    degradedCount: child.scan.degraded.length,
  });
  writeJson(child.scan.id, ARTIFACT.verdict, verdict);

  // Mark the parent's findings with their outcome so the original report page
  // reflects reality if the creator navigates back to it.
  const parentUpdated = parentFindings.map((f) => {
    if (!diff.trustworthy) return f;
    if (diff.resolved.some((r) => r.id === f.id)) return { ...f, state: 'resolved' as const };
    if (diff.persisted.some((p) => p.clauseId === f.clauseId && p.surface === f.surface))
      return { ...f, state: 'persisted' as const };
    return f;
  });
  writeJson(parentScanId, ARTIFACT.findings, parentUpdated);

  const result: RescanResult = {
    ...child,
    findings: merged,
    verdict,
    diff,
    parentScanId,
    parentVerdict: readJson<Verdict>(parentScanId, ARTIFACT.verdict),
  };
  writeJson(child.scan.id, ARTIFACT.diff, {
    parentScanId,
    childScanId: child.scan.id,
    counts: diff.counts,
    allClear: diff.allClear,
    trustworthy: diff.trustworthy,
    summary: diff.summary,
    resolvedIds: diff.resolved.map((f) => f.id),
    persistedIds: diff.persisted.map((f) => f.id),
    freshIds: diff.fresh.map((f) => f.id),
  });

  log.info(`rescan ${parentScanId} -> ${child.scan.id}: ${diff.summary}`);
  return result;
}
