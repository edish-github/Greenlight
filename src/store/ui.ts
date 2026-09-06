'use client';

/**
 * Client-side report state.
 *
 * The report screen has genuinely shared state: the player's position, which
 * finding is selected, and which findings are ticked for repair. Three
 * components need to read it and three need to write it, and prop-drilling that
 * through the tree costs an hour on Sunday for no benefit.
 *
 * Module boundary note: this is the ONE module under src/ that components may
 * import besides src/types. It holds no pipeline logic, touches no filesystem
 * and imports nothing but types, so the rule that keeps the pipeline testable
 * without a browser still holds.
 */
import { create } from 'zustand';
import type { Finding, Severity } from '../types/finding';

export type SeekHandler = (ms: number) => void;

interface UIState {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  selectedFindingId: string | null;
  selectedFixIds: Set<string>;
  /** Registered by PlayerPane so any component can drive the video imperatively. */
  seekHandler: SeekHandler | null;

  setCurrentTime: (ms: number) => void;
  setDuration: (ms: number) => void;
  setPlaying: (playing: boolean) => void;
  selectFinding: (id: string | null) => void;
  registerSeek: (handler: SeekHandler | null) => void;

  /** Moves the player AND selects nothing. Use selectAndSeek for band clicks. */
  seekTo: (ms: number) => void;
  selectAndSeek: (finding: Finding) => void;

  toggleFix: (id: string) => void;
  setFixSelection: (ids: string[]) => void;
  clearFixSelection: () => void;
  isFixSelected: (id: string) => boolean;

  /** Called once per report load. Pre-selects the worst finding and pre-seeks. */
  hydrate: (findings: Finding[], durationMs: number) => void;
}

const SEVERITY_RANK: Record<Severity, number> = { no_ads: 3, limited_ads: 2, advisory: 1 };

/** Everything except manual_review defaults to checked, per the spec. */
export function defaultFixSelection(findings: Finding[]): string[] {
  return findings
    .filter((f) => f.state !== 'resolved' && f.state !== 'dismissed')
    .filter((f) => f.remediation !== 'manual_review')
    .map((f) => f.id);
}

export function worstFinding(findings: Finding[]): Finding | null {
  const active = findings.filter((f) => f.state !== 'resolved' && f.state !== 'dismissed');
  if (!active.length) return findings[0] ?? null;
  return [...active].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      b.confidence - a.confidence ||
      a.startMs - b.startMs,
  )[0];
}

export const useUIStore = create<UIState>((set, get) => ({
  currentTimeMs: 0,
  durationMs: 0,
  isPlaying: false,
  selectedFindingId: null,
  selectedFixIds: new Set<string>(),
  seekHandler: null,

  setCurrentTime: (ms) => set({ currentTimeMs: Math.max(0, ms) }),
  setDuration: (ms) => set({ durationMs: Math.max(0, ms) }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  selectFinding: (selectedFindingId) => set({ selectedFindingId }),
  registerSeek: (seekHandler) => set({ seekHandler }),

  seekTo: (ms) => {
    const { seekHandler, durationMs } = get();
    const clamped = Math.max(0, durationMs ? Math.min(ms, durationMs) : ms);
    set({ currentTimeMs: clamped });
    seekHandler?.(clamped);
  },

  selectAndSeek: (finding) => {
    set({ selectedFindingId: finding.id });
    // Packaging findings are zero-width at t=0 and have no place on the
    // timeline, so clicking one selects without yanking the playhead back.
    if (finding.endMs > 0) get().seekTo(finding.startMs);
  },

  toggleFix: (id) =>
    set((state) => {
      const next = new Set(state.selectedFixIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedFixIds: next };
    }),

  setFixSelection: (ids) => set({ selectedFixIds: new Set(ids) }),
  clearFixSelection: () => set({ selectedFixIds: new Set<string>() }),
  isFixSelected: (id) => get().selectedFixIds.has(id),

  hydrate: (findings, durationMs) => {
    const worst = worstFinding(findings);
    set({
      durationMs,
      selectedFindingId: worst?.id ?? null,
      selectedFixIds: new Set(defaultFixSelection(findings)),
      currentTimeMs: worst && worst.endMs > 0 ? worst.startMs : 0,
    });
    // The player may not be mounted on the very first hydrate; PlayerPane
    // re-applies currentTimeMs on registration, so this is safe either way.
    if (worst && worst.endMs > 0) get().seekHandler?.(worst.startMs);
  },
}));
