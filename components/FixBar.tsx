'use client';

import { useMemo, useState } from 'react';
import { Download, Loader2, ScissorsLineDashed, Wand2 } from 'lucide-react';
import type { Finding } from '../src/types/finding';
import { useUIStore } from '../src/store/ui';

interface Props {
  scanId: string;
  findings: Finding[];
  onFixStarted: (rescanId: string) => void;
  hasFixedFile: boolean;
}

interface FixResponse {
  render?: { rendered: boolean; reason?: string; summary?: string; ms?: number };
  rescanId?: string | null;
  error?: string;
}

/**
 * The confirmation step, in plain language, before anything is rendered.
 *
 * Product principle 2: nothing is auto-applied. The creator sees exactly what
 * will happen to their file, including what will NOT be touched, and then
 * commits it.
 */
export default function FixBar({ scanId, findings, onFixStarted, hasFixedFile }: Props) {
  const selectedFixIds = useUIStore((s) => s.selectedFixIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    const chosen = findings.filter((f) => selectedFixIds.has(f.id) && f.state !== 'resolved');
    const count = (t: string) => chosen.filter((f) => f.remediation === t).length;
    return {
      total: chosen.length,
      bleep: count('bleep'),
      mute: count('mute'),
      blur: count('blur_region'),
      packaging: count('packaging_edit'),
      manual: count('manual_review'),
    };
  }, [findings, selectedFixIds]);

  const renderable = summary.bleep + summary.mute + summary.blur;

  const sentence = (() => {
    if (summary.total === 0) return 'Nothing selected. Tick a finding to build a fix plan.';
    const bits: string[] = [];
    if (summary.bleep) bits.push(`${summary.bleep} span${summary.bleep === 1 ? '' : 's'} bleeped`);
    if (summary.mute) bits.push(`${summary.mute} muted`);
    if (summary.blur) bits.push(`${summary.blur} blurred`);
    if (summary.packaging) bits.push(`${summary.packaging} title change suggested`);
    if (summary.manual) bits.push(`${summary.manual} left for you to judge`);
    return `${bits.join(', ')}.`;
  })();

  async function applyFixes() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId, findingIds: [...selectedFixIds] }),
      });
      const data = (await res.json()) as FixResponse;

      if (!res.ok) {
        setError(data.error ?? 'The fix could not be applied.');
        return;
      }
      if (!data.render?.rendered) {
        setError(data.render?.reason ?? 'Nothing here had a safe automatic fix.');
        return;
      }
      if (data.rescanId) onFixStarted(data.rescanId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The request failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sticky bottom-0 z-20 border-t border-line bg-ink-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-200">
            {summary.total} finding{summary.total === 1 ? '' : 's'} selected
          </p>
          <p className="truncate text-[13px] text-slate-500">{sentence}</p>
          {error ? <p className="mt-1 text-[13px] text-[#ff8a95]">{error}</p> : null}
        </div>

        {hasFixedFile ? (
          <a
            href={`/api/file/${scanId}/fixed.mp4`}
            download={`greenlight-fixed-${scanId.slice(0, 8)}.mp4`}
            className="inline-flex items-center gap-2 rounded-md border border-line bg-ink-850 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-slate-600"
          >
            <Download size={15} />
            Download fixed.mp4
          </a>
        ) : null}

        <a
          href={`/api/file/${scanId}/spans.json`}
          className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
          title="The same spans as data, for Premiere or Resolve. Available after a fix plan is built."
        >
          <ScissorsLineDashed size={15} />
          Editor span list
        </a>

        <button
          type="button"
          onClick={applyFixes}
          disabled={busy || renderable === 0}
          className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-ink-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-slate-500"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
          {busy ? 'Rendering and re-scanning…' : `Apply ${renderable} fix${renderable === 1 ? '' : 'es'}`}
        </button>
      </div>
    </div>
  );
}
