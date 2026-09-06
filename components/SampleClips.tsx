'use client';

import Link from 'next/link';
import { PlayCircle, WifiOff } from 'lucide-react';

import type { SampleClip } from '../src/store/samples';

interface Props {
  samples: SampleClip[];
}

/**
 * Judge mode.
 *
 * These three scans are baked by scripts/precompute-samples.ts and committed,
 * so clicking one resolves from disk with ZERO external API calls. Neither a
 * rate limit nor a downed provider nor a hotel wifi connection can break the
 * demo, which is why the demo video is recorded from this path.
 */
export default function SampleClips({ samples }: Props) {
  if (!samples.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 bg-ink-900 px-4 py-6 text-center">
        <p className="text-sm text-slate-300">No sample clips are baked yet.</p>
        <p className="mx-auto mt-1 max-w-[54ch] text-[13px] leading-relaxed text-slate-500">
          Record three clips into <code className="font-mono text-slate-400">public/samples/</code>{' '}
          and run <code className="font-mono text-slate-400">npm run samples</code>. Until then,
          upload a file above.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {samples.map((sample) => (
        <Link
          key={sample.id}
          href={`/report/${sample.scanId}`}
          className="group rounded-lg border border-line bg-ink-900 p-3 transition-colors hover:border-slate-600"
        >
          <div className="grid aspect-video place-items-center rounded-md border border-line bg-ink-850">
            <PlayCircle size={22} className="text-slate-600 transition-colors group-hover:text-slate-300" />
          </div>
          <p className="mt-2.5 text-sm text-slate-200">{sample.label}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{sample.description}</p>
          <p className="mt-2 font-mono text-[11px] text-slate-600">
            {(sample.durationMs / 1000).toFixed(0)}s · {sample.plantedRisks.length} planted risks
          </p>
        </Link>
      ))}

      <p className="sm:col-span-3 inline-flex items-center gap-2 text-[13px] text-slate-500">
        <WifiOff size={13} />
        These reports are pre-computed. Opening one makes no API calls and works offline.
      </p>
    </div>
  );
}
