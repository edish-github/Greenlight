'use client';

import { AlertTriangle, EyeOff, Mic, Radio } from 'lucide-react';
import type { DegradedFlag } from '../src/types/scan';

interface Props {
  flags: DegradedFlag[];
}

/**
 * Invariant I5 made visible: every external dependency has a labelled degraded
 * state. Never a spinner, never a stack trace, and never a silently missing
 * result that the creator mistakes for a clean file.
 */
const COPY: Record<
  DegradedFlag,
  { icon: typeof AlertTriangle; text: string; tone: 'warn' | 'note' }
> = {
  visual_unavailable: {
    icon: EyeOff,
    text: 'Visual pass unavailable. Audio and packaging findings are still active; anything on screen but not spoken was not checked.',
    tone: 'warn',
  },
  asr_fallback_openai: {
    icon: Mic,
    text: 'Transcribed with the fallback provider. Word timings may be slightly coarser.',
    tone: 'note',
  },
  asr_fallback_local: {
    icon: Mic,
    text: 'Transcribed locally. Slower and less accurate than the hosted model, but it ran offline.',
    tone: 'note',
  },
  asr_unavailable: {
    icon: Radio,
    text: 'No transcript. This scan checked packaging only, so spoken findings are missing entirely.',
    tone: 'warn',
  },
  adjudication_unavailable: {
    icon: AlertTriangle,
    text: 'The Gate did not run. Candidate spans are shown without clause citations, and nothing here is a finding.',
    tone: 'warn',
  },
  packaging_skipped: {
    icon: AlertTriangle,
    text: 'No title or thumbnail was supplied, so the packaging surface was not checked.',
    tone: 'note',
  },
};

export default function DegradedBanner({ flags }: Props) {
  const unique = [...new Set(flags)].filter((f) => COPY[f]);
  if (!unique.length) return null;

  return (
    <div className="space-y-2">
      {unique.map((flag) => {
        const { icon: Icon, text, tone } = COPY[flag];
        const warn = tone === 'warn';
        return (
          <div
            key={flag}
            className={`flex items-start gap-2.5 rounded-md border px-3 py-2 text-[13px] leading-relaxed ${
              warn
                ? 'border-[#f5a524]/35 bg-[#f5a524]/[0.07] text-[#f3d19a]'
                : 'border-line bg-ink-900 text-slate-400'
            }`}
          >
            <Icon size={15} className="mt-0.5 shrink-0" />
            <p className="max-w-[92ch]">{text}</p>
          </div>
        );
      })}
    </div>
  );
}
