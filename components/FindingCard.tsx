'use client';

import { Check, CircleSlash, Hand } from 'lucide-react';
import type { Finding } from '../src/types/finding';
import { useUIStore } from '../src/store/ui';
import ClauseCitation from './ClauseCitation';
import {
  highlightParts,
  REMEDIATION_LABEL,
  SEVERITY_CLASS,
  SEVERITY_LABEL,
  spanLabel,
} from './format';

interface Props {
  finding: Finding;
  /** Terms to mark inside the evidence quote. */
  highlightTerms?: string[];
}

export default function FindingCard({ finding, highlightTerms = [] }: Props) {
  const selectedFindingId = useUIStore((s) => s.selectedFindingId);
  const selectAndSeek = useUIStore((s) => s.selectAndSeek);
  const toggleFix = useUIStore((s) => s.toggleFix);
  const checked = useUIStore((s) => s.selectedFixIds.has(finding.id));

  const selected = finding.id === selectedFindingId;
  const resolved = finding.state === 'resolved';
  const persisted = finding.state === 'persisted';
  const manual = finding.remediation === 'manual_review';
  const tone = SEVERITY_CLASS[finding.severity];

  return (
    <article
      onClick={() => selectAndSeek(finding)}
      className={`relative cursor-pointer overflow-hidden rounded-lg border pl-3 transition-colors ${
        selected ? 'border-slate-500 bg-ink-850' : 'border-line bg-ink-900 hover:border-slate-700'
      } ${resolved ? 'opacity-55' : ''}`}
    >
      <span
        className={`absolute left-0 top-0 h-full w-[3px] ${resolved ? 'bg-[#22c55e]' : tone.rail}`}
        aria-hidden
      />

      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs tabular-nums text-slate-300">
                {spanLabel(finding.startMs, finding.endMs)}
              </span>
              <span className={`rounded border px-1.5 py-0.5 text-[11px] ${tone.border} ${tone.bg} ${tone.text}`}>
                {SEVERITY_LABEL[finding.severity]}
              </span>
              <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                {finding.detector}
              </span>
              {resolved ? (
                <span className="inline-flex items-center gap-1 rounded border border-[#22c55e]/40 bg-[#22c55e]/10 px-1.5 py-0.5 text-[11px] text-[#7ee2a8]">
                  <Check size={10} /> resolved
                </span>
              ) : null}
              {persisted ? (
                <span className="inline-flex items-center gap-1 rounded border border-[#ff4d5e]/40 bg-[#ff4d5e]/10 px-1.5 py-0.5 text-[11px] text-[#ff8a95]">
                  <CircleSlash size={10} /> still firing after the fix
                </span>
              ) : null}
            </div>

            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              <span className="text-slate-500">“</span>
              {highlightParts(finding.evidence, highlightTerms).map((part, i) =>
                part.hit ? (
                  <mark key={i} className="rounded-sm bg-[#f5a524]/25 px-0.5 text-[#f8d9a4]">
                    {part.text}
                  </mark>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
              <span className="text-slate-500">”</span>
            </p>
          </div>

          <label
            onClick={(e) => e.stopPropagation()}
            title={
              manual
                ? 'This has no safe automatic fix. Tick it to include the span in the editor export.'
                : REMEDIATION_LABEL[finding.remediation]
            }
            className="flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-md border border-line bg-ink-850 px-2 py-1.5 text-xs text-slate-300 hover:border-slate-600"
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={resolved}
              onChange={() => toggleFix(finding.id)}
              className="h-3.5 w-3.5 accent-sky-400"
            />
            {manual ? <Hand size={12} className="text-slate-500" /> : null}
            {REMEDIATION_LABEL[finding.remediation]}
          </label>
        </div>

        {selected ? (
          <div className="mt-3 space-y-2">
            <ClauseCitation finding={finding} />
            <p className="max-w-[70ch] text-[13px] leading-relaxed text-slate-400">
              <span className="text-slate-500">Why this fired: </span>
              {finding.rationale}
            </p>
            <p className="font-mono text-[11px] text-slate-600">
              confidence {finding.confidence.toFixed(2)} · candidate {finding.candidateId}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}
