'use client';

import { useEffect, useMemo, useRef } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Finding } from '../src/types/finding';
import { useUIStore } from '../src/store/ui';
import FindingCard from './FindingCard';

interface Props {
  findings: Finding[];
  /** Number of candidates the Gate looked at and cleared. A trust signal. */
  clearedCount?: number;
  dropCount?: number;
}

export default function FindingsPanel({ findings, clearedCount, dropCount }: Props) {
  const selectedFindingId = useUIStore((s) => s.selectedFindingId);
  const listRef = useRef<HTMLDivElement | null>(null);

  const { timed, packaging, resolved } = useMemo(() => {
    const active = findings.filter((f) => f.state !== 'resolved');
    return {
      timed: active.filter((f) => f.endMs > f.startMs),
      packaging: active.filter((f) => f.endMs <= f.startMs),
      resolved: findings.filter((f) => f.state === 'resolved'),
    };
  }, [findings]);

  // Keep the selected card in view when a timeline band is clicked.
  useEffect(() => {
    if (!selectedFindingId) return;
    const node = listRef.current?.querySelector(`[data-finding="${selectedFindingId}"]`);
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedFindingId]);

  const total = timed.length + packaging.length;

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-line bg-ink-900">
      <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-medium text-slate-200">
          {total} finding{total === 1 ? '' : 's'}
        </h2>
        {clearedCount !== undefined || dropCount !== undefined ? (
          <p className="text-[11px] text-slate-500">
            {clearedCount !== undefined ? `${clearedCount} spans cleared` : null}
            {clearedCount !== undefined && dropCount ? ' · ' : null}
            {dropCount ? `${dropCount} model outputs dropped` : null}
          </p>
        ) : null}
      </div>

      <div ref={listRef} className="gl-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {total === 0 && resolved.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <CheckCircle2 size={22} className="mx-auto text-[#22c55e]" />
              <p className="mt-2 text-sm text-slate-300">Nothing matched a clause in this pack.</p>
              <p className="mx-auto mt-1 max-w-[42ch] text-[13px] leading-relaxed text-slate-500">
                Detectors still ran and still found spans worth looking at. They were adjudicated
                against the clause text and none of them matched.
              </p>
            </div>
          </div>
        ) : null}

        {packaging.length ? (
          <div>
            <p className="px-1 pb-1.5 text-[11px] text-slate-500">
              Title and thumbnail — scored separately from the video body
            </p>
            <div className="space-y-2">
              {packaging.map((f) => (
                <div key={f.id} data-finding={f.id}>
                  <FindingCard finding={f} highlightTerms={extractTerms(f)} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {timed.length ? (
          <div className={packaging.length ? 'pt-2' : ''}>
            {packaging.length ? (
              <p className="px-1 pb-1.5 text-[11px] text-slate-500">In the video</p>
            ) : null}
            <div className="space-y-2">
              {timed.map((f) => (
                <div key={f.id} data-finding={f.id}>
                  <FindingCard finding={f} highlightTerms={extractTerms(f)} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {resolved.length ? (
          <div className="pt-3">
            <p className="px-1 pb-1.5 text-[11px] text-slate-500">
              Resolved by the fix — kept on the record
            </p>
            <div className="space-y-2">
              {resolved.map((f) => (
                <div key={f.id} data-finding={f.id}>
                  <FindingCard finding={f} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Pulls the terms worth marking inside the evidence quote out of the finding's
 * own rationale and clause. Deliberately conservative: marking the wrong word
 * is worse than marking nothing.
 */
function extractTerms(finding: Finding): string[] {
  const quoted = [...finding.rationale.matchAll(/"([^"]{2,24})"/g)].map((m) => m[1]);
  return quoted.length ? quoted : [];
}
