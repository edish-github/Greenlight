'use client';

import { Check, Loader2 } from 'lucide-react';

export interface Stage {
  status: string;
  label: string;
  ms: number;
  detail: string;
}

const EXPECTED: { status: string; label: string }[] = [
  { status: 'demuxing', label: 'Demuxed' },
  { status: 'transcribing', label: 'Transcribed' },
  { status: 'detecting', label: 'Candidates' },
  { status: 'adjudicating', label: 'Adjudicated' },
  { status: 'scoring', label: 'Scored' },
];

/**
 * A stage list, not a spinner.
 *
 * Every line shows what the stage produced and how long it took, including how
 * many model outputs were rejected. Showing the drop count during the scan is a
 * deliberate trust signal: it tells the viewer that things get thrown away.
 */
export default function ScanProgress({ stages, error }: { stages: Stage[]; error?: string | null }) {
  const done = new Map(stages.map((s) => [s.status, s]));

  return (
    <div className="rounded-lg border border-line bg-ink-900 p-4">
      <h2 className="text-sm font-medium text-slate-200">Scanning</h2>
      <ul className="mt-3 space-y-2 font-mono text-[13px]">
        {EXPECTED.map(({ status, label }) => {
          const stage = done.get(status);
          const running = !stage && !error && EXPECTED.findIndex((s) => s.status === status) === done.size;
          return (
            <li key={status} className="flex items-start gap-2.5">
              <span className="mt-0.5 w-4 shrink-0">
                {stage ? (
                  <Check size={13} className="text-[#22c55e]" />
                ) : running ? (
                  <Loader2 size={13} className="animate-spin text-slate-400" />
                ) : (
                  <span className="block h-[13px] w-[13px] rounded-sm border border-slate-700" />
                )}
              </span>
              <span className={stage ? 'text-slate-200' : 'text-slate-600'}>{label}</span>
              {stage ? (
                <>
                  <span className="tabular-nums text-slate-500">
                    {(stage.ms / 1000).toFixed(2)}s
                  </span>
                  <span className="min-w-0 flex-1 truncate font-sans text-slate-500">
                    {stage.detail}
                  </span>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>

      {error ? (
        <p className="mt-3 rounded-md border border-[#ff4d5e]/35 bg-[#ff4d5e]/[0.07] p-2.5 text-[13px] text-[#f7b4bb]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
