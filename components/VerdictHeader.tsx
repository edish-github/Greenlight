'use client';

import { useState } from 'react';
import { Info, ShieldAlert } from 'lucide-react';
import type { Finding } from '../src/types/finding';
import type { Verdict } from '../src/types/verdict';
import { money, VERDICT_COPY } from './format';

interface Props {
  verdict: Verdict;
  findings: Finding[];
  packVersion: string;
  scanId: string;
}

/**
 * The banner at the top of the report.
 *
 * The disclaimer is rendered unconditionally and has no dismiss control. It
 * comes from the Verdict data contract rather than from this file, so it cannot
 * be forgotten in a refactor or styled out of existence at 2am.
 */
export default function VerdictHeader({ verdict, findings, packVersion, scanId }: Props) {
  const [showAssumption, setShowAssumption] = useState(false);
  const copy = VERDICT_COPY[verdict.status];
  const drivers = verdict.drivers
    .map((id) => findings.find((f) => f.id === id))
    .filter((f): f is Finding => Boolean(f));

  return (
    <header className="rounded-lg border border-line bg-ink-900">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 p-4">
        <div className="min-w-[220px]">
          <div className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm font-medium ${copy.tone}`}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: copy.hex }} />
            {copy.label}
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Confidence {verdict.confidence} · {verdict.counts.no_ads} no-ads,{' '}
            {verdict.counts.limited_ads} limited, {verdict.counts.advisory} advisory
          </p>
        </div>

        <div className="min-w-[220px] flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-slate-100">
              {money(verdict.revenueAtRisk.low, verdict.revenueAtRisk.currency)}–
              {money(verdict.revenueAtRisk.high, verdict.revenueAtRisk.currency)}
            </span>
            <button
              type="button"
              onClick={() => setShowAssumption((v) => !v)}
              aria-expanded={showAssumption}
              className="inline-flex items-center gap-1 text-xs text-slate-400 underline decoration-dotted underline-offset-4 hover:text-slate-200"
            >
              <Info size={12} />
              how this was calculated
            </button>
          </div>
          <p className="mt-1 text-sm text-slate-400">Ad revenue at risk, as a range</p>
          {showAssumption ? (
            <p className="mt-2 max-w-[70ch] rounded-md border border-line bg-ink-850 p-2.5 text-[13px] leading-relaxed text-slate-400">
              {verdict.revenueAtRisk.assumption}
            </p>
          ) : null}
        </div>

        {drivers.length ? (
          <div className="min-w-[200px]">
            <p className="text-sm text-slate-400">Driven by</p>
            <ul className="mt-1.5 space-y-1">
              {drivers.map((f) => (
                <li key={f.id} className="font-mono text-xs text-slate-300">
                  {f.clauseId}
                  <span className="ml-2 font-sans text-slate-500">{f.clauseTitle}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex items-start gap-2 border-t border-line px-4 py-2.5 text-[13px] leading-relaxed text-slate-400">
        <ShieldAlert size={15} className="mt-0.5 shrink-0 text-slate-500" />
        <p className="max-w-[92ch]">{verdict.disclaimer}</p>
      </div>

      <div className="border-t border-line px-4 py-2 font-mono text-[11px] text-slate-600">
        scan {scanId.slice(0, 12)} · pack {packVersion}
      </div>
    </header>
  );
}
