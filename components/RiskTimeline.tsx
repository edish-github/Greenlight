'use client';

import { useMemo, useRef } from 'react';
import type { Finding } from '../src/types/finding';
import { useUIStore } from '../src/store/ui';
import { RESOLVED_HEX, SEVERITY_HEX, SEVERITY_LABEL, spanLabel, timecode } from './format';

interface Props {
  findings: Finding[];
  durationMs: number;
  /** Read-only mode for the before/after comparison. No clicks, no playhead. */
  interactive?: boolean;
  /** Shown when there is nothing to draw. */
  emptyLabel?: string;
  height?: number;
  showPlayhead?: boolean;
  className?: string;
}

interface Band {
  finding: Finding;
  leftPct: number;
  widthPct: number;
  color: string;
  resolved: boolean;
}

/** Narrow spans are unclickable and invisible; floor the drawn width. */
const MIN_WIDTH_PCT = 0.7;

/**
 * The signature component.
 *
 * Everything the product claims is visible here at once: where the risk is, how
 * bad it is, and that it maps to a real moment in the file. Clicking a band
 * seeks the player and selects the finding, which is the interaction the whole
 * report is built around.
 */
export default function RiskTimeline({
  findings,
  durationMs,
  interactive = true,
  emptyLabel = 'No timed findings',
  height = 44,
  showPlayhead = true,
  className = '',
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const currentTimeMs = useUIStore((s) => s.currentTimeMs);
  const selectedFindingId = useUIStore((s) => s.selectedFindingId);
  const selectAndSeek = useUIStore((s) => s.selectAndSeek);
  const seekTo = useUIStore((s) => s.seekTo);

  const safeDuration = Math.max(durationMs, 1);

  const bands = useMemo<Band[]>(
    () =>
      findings
        // Packaging findings have no position in time. They get their own row in
        // the findings panel rather than a fake band at zero.
        .filter((f) => f.endMs > f.startMs)
        .map((finding) => {
          const leftPct = (finding.startMs / safeDuration) * 100;
          const rawWidth = ((finding.endMs - finding.startMs) / safeDuration) * 100;
          const resolved = finding.state === 'resolved';
          return {
            finding,
            leftPct: Math.max(0, Math.min(leftPct, 100 - MIN_WIDTH_PCT)),
            widthPct: Math.max(MIN_WIDTH_PCT, Math.min(rawWidth, 100 - leftPct)),
            color: resolved ? RESOLVED_HEX : SEVERITY_HEX[finding.severity],
            resolved,
          };
        })
        .sort((a, b) => b.widthPct - a.widthPct),
    [findings, safeDuration],
  );

  const playheadPct = Math.max(0, Math.min((currentTimeMs / safeDuration) * 100, 100));

  const scrubToPoint = (clientX: number) => {
    const track = trackRef.current;
    if (!track || !interactive) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
    seekTo(Math.round(ratio * safeDuration));
  };

  return (
    <div className={className}>
      <div
        ref={trackRef}
        onClick={(e) => scrubToPoint(e.clientX)}
        role={interactive ? 'slider' : 'img'}
        aria-label={interactive ? 'Risk timeline. Click to seek.' : 'Risk timeline'}
        aria-valuemin={interactive ? 0 : undefined}
        aria-valuemax={interactive ? safeDuration : undefined}
        aria-valuenow={interactive ? currentTimeMs : undefined}
        tabIndex={interactive ? 0 : -1}
        onKeyDown={(e) => {
          if (!interactive) return;
          if (e.key === 'ArrowRight') seekTo(currentTimeMs + 1000);
          if (e.key === 'ArrowLeft') seekTo(currentTimeMs - 1000);
        }}
        className={`relative w-full overflow-hidden rounded-md border border-line bg-ink-850 ${
          interactive ? 'cursor-pointer' : ''
        }`}
        style={{ height }}
      >
        {/* ten-second gridlines: enough structure to read position, not enough to compete */}
        <div className="pointer-events-none absolute inset-0">
          {Array.from({ length: Math.min(Math.floor(safeDuration / 10_000), 40) }).map((_, i) => (
            <span
              key={i}
              className="absolute top-0 h-full w-px bg-white/5"
              style={{ left: `${(((i + 1) * 10_000) / safeDuration) * 100}%` }}
            />
          ))}
        </div>

        {bands.length === 0 ? (
          <div className="grid h-full place-items-center text-xs text-slate-500">{emptyLabel}</div>
        ) : null}

        {bands.map(({ finding, leftPct, widthPct, color, resolved }) => {
          const selected = finding.id === selectedFindingId;
          return (
            <button
              key={finding.id}
              type="button"
              disabled={!interactive}
              onClick={(e) => {
                e.stopPropagation();
                selectAndSeek(finding);
              }}
              title={`${SEVERITY_LABEL[finding.severity]} · ${finding.clauseId} · ${spanLabel(
                finding.startMs,
                finding.endMs,
              )}${resolved ? ' · resolved' : ''}`}
              aria-label={`${SEVERITY_LABEL[finding.severity]} at ${timecode(finding.startMs)}, ${finding.clauseTitle}`}
              className="absolute top-0 h-full transition-[opacity,transform] disabled:cursor-default"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                backgroundColor: color,
                opacity: resolved ? 0.28 : selected ? 1 : 0.78,
                boxShadow: selected ? `inset 0 0 0 2px #e6ebf4` : undefined,
              }}
            />
          );
        })}

        {showPlayhead && interactive ? (
          <span
            className="pointer-events-none absolute top-0 z-10 h-full w-[2px] bg-white"
            style={{ left: `${playheadPct}%` }}
          >
            <span className="absolute -left-[3px] -top-[3px] h-2 w-2 rounded-full bg-white" />
          </span>
        ) : null}
      </div>

      <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] tabular-nums text-slate-500">
        <span>00:00.0</span>
        <span>{timecode(safeDuration)}</span>
      </div>
    </div>
  );
}
