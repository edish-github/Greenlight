/**
 * The filter_complex string builder.
 *
 * PURE. This file does not spawn ffmpeg, does not touch the filesystem, and has
 * no async surface at all. That is deliberate: it means the filter graph can be
 * iterated on against unit tests in milliseconds instead of against four-second
 * encodes. Losing an evening to a misplaced semicolon in a filter graph is one
 * of the classic ways a hackathon weekend disappears.
 *
 * Everything that actually runs a process lives in render.ts, which calls
 * src/lib/ffmpeg.ts - the only module in the app permitted to spawn.
 */
import type { FixItem, FixPlan } from '../../types/fixplan';

/** Types this builder can express in a single pass. */
export const RENDERABLE = new Set(['mute', 'bleep', 'blur_region']);

export interface FilterGraph {
  /** The -filter_complex argument, or null when there is nothing to render. */
  filterComplex: string | null;
  /** Output pad to map for audio, e.g. "[aout]". Null when audio is untouched. */
  audioOutLabel: string | null;
  /** Output pad to map for video, e.g. "[vout]". Null when video is copied. */
  videoOutLabel: string | null;
  /** True when no video filter is needed and the stream can be copied verbatim. */
  videoCopy: boolean;
  applied: FixItem[];
  skipped: { item: FixItem; reason: string }[];
  counts: { mute: number; bleep: number; blur: number };
}

export interface FilterOptions {
  /** Tone frequency in Hz. YouTube's guidelines describe bleeping as obscuring. */
  bleepHz?: number;
  /** Tone gain. 1.0 is painfully loud next to speech; 0.6 sits just under dialogue level. */
  bleepGain?: number;
  /** Sine sample rate. Must be sane; ffmpeg auto-inserts conversion before amix. */
  sampleRate?: number;
  /** Box blur strength for blur_region. */
  blurStrength?: number;
}

const DEFAULTS: Required<FilterOptions> = {
  bleepHz: 1000,
  bleepGain: 0.6,
  sampleRate: 44100,
  blurStrength: 12,
};

/**
 * Milliseconds to the seconds string ffmpeg wants.
 *
 * Rounds in integer space before dividing. `(12905/1000).toFixed(2)` returns
 * "12.90" because 12.905 is not exactly representable, which would silently
 * shorten a span by 5ms on some values and not others. Integer rounding is
 * boring and predictable, and predictable is what a filter graph needs.
 */
export function sec(ms: number): string {
  return (Math.round(Math.max(0, ms) / 10) / 100).toFixed(2);
}

function durationSec(item: FixItem): string {
  return sec(Math.max(1, item.endMs - item.startMs));
}

/**
 * Spans that silence audio. A bleep is a mute PLUS a tone: silencing the word
 * underneath is what makes it obscured rather than merely covered, and obscured
 * profanity is the category YouTube places back in the ad-eligible tier.
 */
export function buildVolumeChain(items: FixItem[]): string {
  return items
    .map((i) => `volume=enable='between(t,${sec(i.startMs)},${sec(i.endMs)})':volume=0`)
    .join(',');
}

/** One gated sine source per bleep span. */
export function buildBleepSources(
  items: FixItem[],
  opts: Required<FilterOptions>,
): { chains: string[]; labels: string[] } {
  const chains: string[] = [];
  const labels: string[] = [];
  items.forEach((item, index) => {
    const label = `bp${index}`;
    const delay = Math.max(0, Math.round(item.startMs));
    chains.push(
      `sine=f=${opts.bleepHz}:d=${durationSec(item)}:r=${opts.sampleRate},` +
        `adelay=${delay}|${delay},` +
        `volume=${opts.bleepGain}[${label}]`,
    );
    labels.push(`[${label}]`);
  });
  return { chains, labels };
}

/** crop -> boxblur -> overlay, gated to the span. One triple per region. */
export function buildBlurChain(items: FixItem[], opts: Required<FilterOptions>): string[] {
  const chains: string[] = [];
  let current = '[0:v]';
  items.forEach((item, index) => {
    const box = item.box!;
    const c = `bc${index}`;
    const b = `bb${index}`;
    const next = index === items.length - 1 ? '[vout]' : `[v${index}]`;
    chains.push(`${current}split=2[base${index}][src${index}]`);
    chains.push(`[src${index}]crop=${box.w}:${box.h}:${box.x}:${box.y}[${c}]`);
    chains.push(`[${c}]boxblur=${opts.blurStrength}[${b}]`);
    chains.push(
      `[base${index}][${b}]overlay=${box.x}:${box.y}:` +
        `enable='between(t,${sec(item.startMs)},${sec(item.endMs)})'${next}`,
    );
    current = next;
  });
  return chains;
}

/**
 * Compile an approved fix plan into a single filter_complex.
 *
 * One pass, not N passes. Re-encoding a three minute clip once takes about four
 * seconds; doing it five times takes twenty and looks bad on camera.
 */
export function buildFilterComplex(plan: FixPlan, options: FilterOptions = {}): FilterGraph {
  const opts = { ...DEFAULTS, ...options };
  const applied: FixItem[] = [];
  const skipped: { item: FixItem; reason: string }[] = [];

  const mutes: FixItem[] = [];
  const bleeps: FixItem[] = [];
  const blurs: FixItem[] = [];

  for (const item of plan.items) {
    if (item.type === 'manual_review') {
      skipped.push({ item, reason: 'no safe automatic fix; flagged for manual review' });
      continue;
    }
    if (item.type === 'packaging_edit') {
      skipped.push({ item, reason: 'packaging is text, not media; suggestion returned instead' });
      continue;
    }
    if (item.type === 'trim') {
      // Trimming changes the duration, which invalidates every timestamp on the
      // report and every span in the plan. It needs a concat graph and a
      // remapped timeline, and that is a separate feature rather than a branch
      // of this one. Saying so out loud beats emitting a graph that silently
      // desynchronises the findings from the file.
      skipped.push({ item, reason: 'trim is not renderable in a single pass; it remaps the timeline' });
      continue;
    }
    if (item.endMs <= item.startMs) {
      skipped.push({ item, reason: `inverted or empty span ${item.startMs}-${item.endMs}` });
      continue;
    }
    if (item.type === 'blur_region') {
      if (!item.box) {
        skipped.push({ item, reason: 'blur_region requires a bounding box' });
        continue;
      }
      blurs.push(item);
      applied.push(item);
      continue;
    }
    if (item.type === 'mute') mutes.push(item);
    if (item.type === 'bleep') bleeps.push(item);
    applied.push(item);
  }

  const silenced = [...mutes, ...bleeps].sort((a, b) => a.startMs - b.startMs);
  const parts: string[] = [];
  let audioOutLabel: string | null = null;
  let videoOutLabel: string | null = null;

  if (silenced.length) {
    const volume = buildVolumeChain(silenced);
    if (bleeps.length) {
      parts.push(`[0:a]${volume}[a0]`);
      const { chains, labels } = buildBleepSources(
        [...bleeps].sort((a, b) => a.startMs - b.startMs),
        opts,
      );
      parts.push(...chains);
      parts.push(
        `[a0]${labels.join('')}amix=inputs=${labels.length + 1}:duration=first:normalize=0[aout]`,
      );
    } else {
      parts.push(`[0:a]${volume}[aout]`);
    }
    audioOutLabel = '[aout]';
  }

  if (blurs.length) {
    parts.push(...buildBlurChain([...blurs].sort((a, b) => a.startMs - b.startMs), opts));
    videoOutLabel = '[vout]';
  }

  return {
    filterComplex: parts.length ? parts.join(';') : null,
    audioOutLabel,
    videoOutLabel,
    videoCopy: videoOutLabel === null,
    applied,
    skipped,
    counts: { mute: mutes.length, bleep: bleeps.length, blur: blurs.length },
  };
}

/** ffmpeg arguments implied by a graph, minus input and output paths. */
export function buildFfmpegArgs(graph: FilterGraph): string[] {
  const args: string[] = [];
  if (graph.filterComplex) args.push('-filter_complex', graph.filterComplex);

  if (graph.videoOutLabel) {
    args.push('-map', graph.videoOutLabel, '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p');
  } else {
    // Audio-only fixes never re-encode video. Faster, and pixel-identical to the
    // creator's own export, which matters when they are handing it to a client.
    args.push('-map', '0:v?', '-c:v', 'copy');
  }

  if (graph.audioOutLabel) {
    args.push('-map', graph.audioOutLabel, '-c:a', 'aac', '-b:a', '192k');
  } else {
    args.push('-map', '0:a?', '-c:a', 'copy');
  }

  args.push('-movflags', '+faststart');
  return args;
}

/** Plain-language summary for the confirmation step. Never a raw filter string. */
export function describeGraph(graph: FilterGraph): string {
  const bits: string[] = [];
  if (graph.counts.bleep) bits.push(`${graph.counts.bleep} span${graph.counts.bleep === 1 ? '' : 's'} will be bleeped`);
  if (graph.counts.mute) bits.push(`${graph.counts.mute} span${graph.counts.mute === 1 ? '' : 's'} muted`);
  if (graph.counts.blur) bits.push(`${graph.counts.blur} region${graph.counts.blur === 1 ? '' : 's'} blurred`);
  const manual = graph.skipped.filter((s) => s.item.type === 'manual_review').length;
  const packaging = graph.skipped.filter((s) => s.item.type === 'packaging_edit').length;
  if (packaging) bits.push(`${packaging} packaging change${packaging === 1 ? '' : 's'} suggested for you to apply`);
  if (manual) bits.push(`${manual} item${manual === 1 ? '' : 's'} need${manual === 1 ? 's' : ''} manual review`);
  return bits.length ? `${bits.join(', ')}.` : 'Nothing selected to render.';
}
