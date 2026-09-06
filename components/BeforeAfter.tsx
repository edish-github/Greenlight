'use client';

import { ArrowRight, CircleAlert, CircleCheck } from 'lucide-react';
import type { Finding } from '../src/types/finding';
import type { Verdict } from '../src/types/verdict';
import RiskTimeline from './RiskTimeline';
import { VERDICT_COPY } from './format';

interface Props {
  durationMs: number;
  before: { findings: Finding[]; verdict: Verdict | null; scanId: string };
  after: { findings: Finding[]; verdict: Verdict | null; scanId: string };
  diff: {
    counts: { resolved: number; persisted: number; fresh: number; unverified: number };
    allClear: boolean;
    trustworthy: boolean;
    summary: string;
  } | null;
}

function StatusPill({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) return <span className="text-xs text-slate-500">no verdict</span>;
  const copy = VERDICT_COPY[verdict.status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs ${copy.tone}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: copy.hex }} />
      {copy.label}
    </span>
  );
}

/**
 * The fifteen seconds of demo that proves the loop closed.
 *
 * Both rows are drawn by the same component from the same data. If the bottom
 * row is green it is green because the corrected file went through the whole
 * pipeline again, not because this component was told to draw it that way.
 */
export default function BeforeAfter({ durationMs, before, after, diff }: Props) {
  return (
    <section className="rounded-lg border border-line bg-ink-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-200">Before and after the fix</h2>
        {diff ? (
          <p
            className={`inline-flex max-w-[70ch] items-start gap-2 text-[13px] ${
              diff.allClear ? 'text-[#7ee2a8]' : 'text-[#f3d19a]'
            }`}
          >
            {diff.allClear ? (
              <CircleCheck size={14} className="mt-0.5 shrink-0" />
            ) : (
              <CircleAlert size={14} className="mt-0.5 shrink-0" />
            )}
            {diff.summary}
          </p>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2.5">
            <span className="text-[13px] text-slate-400">Original</span>
            <StatusPill verdict={before.verdict} />
            <span className="font-mono text-[11px] text-slate-600">{before.scanId.slice(0, 10)}</span>
          </div>
          <RiskTimeline
            findings={before.findings}
            durationMs={durationMs}
            interactive={false}
            showPlayhead={false}
            height={30}
            emptyLabel="no timed findings"
          />
        </div>

        <div className="flex items-center gap-2 pl-1 text-slate-600">
          <ArrowRight size={14} />
          <span className="text-[11px]">re-scanned through the identical pipeline</span>
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-2.5">
            <span className="text-[13px] text-slate-400">Corrected file</span>
            <StatusPill verdict={after.verdict} />
            <span className="font-mono text-[11px] text-slate-600">{after.scanId.slice(0, 10)}</span>
          </div>
          <RiskTimeline
            findings={after.findings.filter((f) => f.state !== 'resolved')}
            durationMs={durationMs}
            interactive={false}
            showPlayhead={false}
            height={30}
            emptyLabel={
              diff && !diff.trustworthy
                ? 'the re-scan could not check this file'
                : 'nothing fired on the corrected file'
            }
          />
        </div>
      </div>

      {diff && !diff.trustworthy ? (
        <p className="mt-4 max-w-[80ch] rounded-md border border-[#f5a524]/35 bg-[#f5a524]/[0.07] p-2.5 text-[13px] leading-relaxed text-[#f3d19a]">
          An empty bottom timeline here does not mean the file is clean. The re-scan ran without a
          transcript or without the Gate, so nothing could have fired either way. Re-run it with the
          providers available before trusting this comparison.
        </p>
      ) : null}

      {diff && diff.counts.persisted > 0 ? (
        <p className="mt-4 max-w-[80ch] rounded-md border border-[#ff4d5e]/30 bg-[#ff4d5e]/[0.06] p-2.5 text-[13px] leading-relaxed text-[#f7b4bb]">
          {diff.counts.persisted} finding{diff.counts.persisted === 1 ? '' : 's'} survived the
          render. That usually means the span needs a wider cut or a real edit rather than a bleep,
          so {diff.counts.persisted === 1 ? 'it has' : 'they have'} been moved to manual review.
        </p>
      ) : null}
    </section>
  );
}
