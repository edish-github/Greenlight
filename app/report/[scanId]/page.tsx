'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import BeforeAfter from '../../../components/BeforeAfter';
import DegradedBanner from '../../../components/DegradedBanner';
import FindingsPanel from '../../../components/FindingsPanel';
import FixBar from '../../../components/FixBar';
import PlayerPane from '../../../components/PlayerPane';
import RiskTimeline from '../../../components/RiskTimeline';
import ScanProgress from '../../../components/ScanProgress';
import VerdictHeader from '../../../components/VerdictHeader';
import { useUIStore } from '../../../src/store/ui';
import type { Candidate, Finding } from '../../../src/types/finding';
import type { Scan } from '../../../src/types/scan';
import type { Verdict } from '../../../src/types/verdict';

interface ReportPayload {
  scan: Scan;
  verdict: Verdict | null;
  findings: Finding[];
  candidates: Candidate[];
  diff: {
    counts: { resolved: number; persisted: number; fresh: number; unverified: number };
    allClear: boolean;
    trustworthy: boolean;
    summary: string;
  } | null;
  parent: { scan: Scan; verdict: Verdict | null; findings: Finding[] } | null;
  stages: { status: string; label: string; ms: number; detail: string }[];
  running: boolean;
  jobError: string | null;
  hasFixedFile: boolean;
  error?: string;
}

const POLL_MS = 900;

export default function ReportPage({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = use(params);
  const router = useRouter();
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const hydrate = useUIStore((s) => s.hydrate);
  const setDuration = useUIStore((s) => s.setDuration);

  const fetchReport = useCallback(async () => {
    const res = await fetch(`/api/scan/${scanId}`, { cache: 'no-store' });
    const data = (await res.json()) as ReportPayload;
    if (!res.ok) {
      setLoadError(data.error ?? 'That scan could not be loaded.');
      return null;
    }
    setLoadError(null);
    setReport(data);
    return data;
  }, [scanId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const data = await fetchReport().catch(() => null);
      if (cancelled) return;
      if (data && (data.running || data.scan.status !== 'complete')) {
        timer = setTimeout(tick, POLL_MS);
      }
    };
    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchReport]);

  // Pre-select the worst finding and pre-seek the player, once, on completion.
  // The first thing on screen is then a real problem at a real timestamp.
  useEffect(() => {
    if (hydrated || !report || report.scan.status !== 'complete') return;
    setDuration(report.scan.durationMs);
    hydrate(report.findings, report.scan.durationMs);
    setHydrated(true);
  }, [report, hydrated, hydrate, setDuration]);

  const clearedCount = useMemo(() => {
    if (!report) return undefined;
    const withFindings = new Set(report.findings.map((f) => f.candidateId));
    return report.candidates.filter((c) => !withFindings.has(c.id)).length;
  }, [report]);

  if (loadError) {
    return (
      <main className="mx-auto max-w-[820px] px-6 py-20">
        <h1 className="text-lg text-slate-100">{loadError}</h1>
        <p className="mt-2 text-[13px] text-slate-500">
          Scan ids are derived from the file, the title and the policy pack version. If the pack was
          bumped, the old id no longer resolves and the file needs re-scanning.
        </p>
        <Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm text-sky-300 hover:text-sky-200">
          <ArrowLeft size={14} /> Scan another file
        </Link>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="mx-auto max-w-[820px] px-6 py-20">
        <p className="text-sm text-slate-500">Loading the report…</p>
      </main>
    );
  }

  const { scan, verdict, findings, diff, parent } = report;

  if (scan.status === 'failed') {
    return (
      <main className="mx-auto max-w-[820px] px-6 py-20">
        <h1 className="text-lg text-slate-100">This scan stopped at {scan.status}.</h1>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-slate-400">
          {scan.error?.message ?? report.jobError ?? 'No further detail was recorded.'}
        </p>
        <Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm text-sky-300 hover:text-sky-200">
          <ArrowLeft size={14} /> Scan another file
        </Link>
      </main>
    );
  }

  if (scan.status !== 'complete' || !verdict) {
    return (
      <main className="mx-auto max-w-[820px] space-y-4 px-6 py-16">
        <ScanProgress stages={report.stages} error={report.jobError} />
        <p className="font-mono text-[11px] text-slate-600">
          {scan.sourceName} · {(scan.durationMs / 1000).toFixed(1)}s · pack {scan.packVersion}
        </p>
      </main>
    );
  }

  const isRescan = Boolean(parent);
  const videoSrc = `/api/file/${scanId}/input.mp4`;

  return (
    <>
      <main className="mx-auto max-w-[1500px] space-y-4 px-6 py-6">
        <VerdictHeader
          verdict={verdict}
          findings={findings}
          packVersion={scan.packVersion}
          scanId={scan.id}
        />

        <DegradedBanner flags={scan.degraded} />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,1fr)]">
          <div className="space-y-4">
            <PlayerPane
              src={videoSrc}
              label={
                isRescan
                  ? 'Corrected file. Play the flagged spans and listen for the bleep.'
                  : `${scan.sourceName} · ${(scan.durationMs / 1000).toFixed(1)}s`
              }
            />

            <div className="rounded-lg border border-line bg-ink-900 p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-slate-200">Risk timeline</h2>
                <p className="text-[11px] text-slate-500">Click a band to jump to it</p>
              </div>
              <RiskTimeline findings={findings} durationMs={scan.durationMs} />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
                <Legend hex="#ff4d5e" label="No ads" />
                <Legend hex="#f5a524" label="Limited ads" />
                <Legend hex="#64748b" label="Advisory" />
                {findings.some((f) => f.state === 'resolved') ? (
                  <Legend hex="#22c55e" label="Resolved by the fix" />
                ) : null}
              </div>
            </div>

            {isRescan && parent ? (
              <BeforeAfter
                durationMs={scan.durationMs}
                before={{
                  findings: parent.findings,
                  verdict: parent.verdict,
                  scanId: parent.scan.id,
                }}
                after={{ findings, verdict, scanId: scan.id }}
                diff={diff}
              />
            ) : null}

            {isRescan && parent ? (
              <Link
                href={`/report/${parent.scan.id}`}
                className="inline-flex items-center gap-2 text-[13px] text-slate-400 hover:text-slate-200"
              >
                <ArrowLeft size={13} /> Back to the original scan
              </Link>
            ) : null}
          </div>

          <div className="min-h-[520px] lg:h-[calc(100vh-200px)] lg:sticky lg:top-4">
            <FindingsPanel
              findings={findings}
              clearedCount={clearedCount}
              dropCount={scan.counts.drops}
            />
          </div>
        </div>
      </main>

      <FixBar
        scanId={scanId}
        findings={findings}
        hasFixedFile={report.hasFixedFile}
        onFixStarted={(rescanId) => router.push(`/report/${rescanId}`)}
      />
    </>
  );
}

function Legend({ hex, label }: { hex: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-4 rounded-sm" style={{ backgroundColor: hex }} />
      {label}
    </span>
  );
}
