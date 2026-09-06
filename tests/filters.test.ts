/**
 * Defends invariant I5 and the demo's most important sound.
 *
 * No ffmpeg is spawned anywhere in this file. The filter graph is a string, and
 * a string can be asserted in a millisecond. That is the entire reason filters.ts
 * is a pure builder.
 */
import { describe, expect, it } from 'vitest';
import {
  buildBleepSources,
  buildFfmpegArgs,
  buildFilterComplex,
  buildVolumeChain,
  describeGraph,
  sec,
} from '../src/pipeline/remediate/filters';
import type { FixItem, FixPlan } from '../src/types/fixplan';

function plan(items: Partial<FixItem>[]): FixPlan {
  return {
    scanId: 'test',
    createdAt: '2026-09-06T00:00:00.000Z',
    dismissed: [],
    items: items.map((i, n) => ({
      findingId: `f${n}`,
      type: 'bleep',
      surface: 'audio',
      startMs: 1000,
      endMs: 1500,
      ...i,
    })) as FixItem[],
  };
}

describe('sec()', () => {
  it('renders milliseconds as fixed-precision seconds', () => {
    expect(sec(0)).toBe('0.00');
    expect(sec(12_400)).toBe('12.40');
    expect(sec(12_905)).toBe('12.91');
    expect(sec(-50)).toBe('0.00');
  });
});

describe('single mute', () => {
  const graph = buildFilterComplex(plan([{ type: 'mute', startMs: 12_400, endMs: 12_900 }]));

  it('gates volume to the span and needs no amix', () => {
    expect(graph.filterComplex).toBe(
      "[0:a]volume=enable='between(t,12.40,12.90)':volume=0[aout]",
    );
    expect(graph.filterComplex).not.toContain('amix');
    expect(graph.filterComplex).not.toContain('sine');
  });

  it('copies the video stream untouched', () => {
    expect(graph.videoCopy).toBe(true);
    expect(graph.videoOutLabel).toBeNull();
    const args = buildFfmpegArgs(graph);
    expect(args).toContain('-c:v');
    expect(args[args.indexOf('-c:v') + 1]).toBe('copy');
    expect(args).toContain('[aout]');
  });
});

describe('single bleep', () => {
  const graph = buildFilterComplex(plan([{ type: 'bleep', startMs: 12_400, endMs: 12_900 }]));
  const parts = graph.filterComplex!.split(';');

  it('mutes the word underneath the tone', () => {
    expect(parts[0]).toBe("[0:a]volume=enable='between(t,12.40,12.90)':volume=0[a0]");
  });

  it('generates a 1kHz sine gated to the span by adelay', () => {
    expect(parts[1]).toContain('sine=f=1000:d=0.50');
    expect(parts[1]).toContain('adelay=12400|12400');
    expect(parts[1]).toMatch(/\[bp0\]$/);
  });

  it('mixes the tone back over the muted track', () => {
    expect(parts[2]).toBe('[a0][bp0]amix=inputs=2:duration=first:normalize=0[aout]');
  });

  it('keeps normalize off so the whole track does not duck', () => {
    expect(graph.filterComplex).toContain('normalize=0');
  });
});

describe('chained multi-span fixes', () => {
  const graph = buildFilterComplex(
    plan([
      { type: 'bleep', startMs: 55_440, endMs: 55_785 },
      { type: 'mute', startMs: 3_000, endMs: 3_500 },
      { type: 'bleep', startMs: 59_675, endMs: 60_020 },
    ]),
  );
  const parts = graph.filterComplex!.split(';');

  it('compiles every span into ONE filter_complex, not one pass each', () => {
    expect(graph.applied).toHaveLength(3);
    expect(parts.filter((p) => p.startsWith('[0:a]'))).toHaveLength(1);
  });

  it('chains all volume gates in time order on a single input', () => {
    expect(parts[0]).toBe(
      "[0:a]volume=enable='between(t,3.00,3.50)':volume=0," +
        "volume=enable='between(t,55.44,55.79)':volume=0," +
        "volume=enable='between(t,59.68,60.02)':volume=0[a0]",
    );
  });

  it('creates one sine source per bleep with distinct labels', () => {
    expect(parts[1]).toContain('adelay=55440|55440');
    expect(parts[1]).toContain('[bp0]');
    expect(parts[2]).toContain('adelay=59675|59675');
    expect(parts[2]).toContain('[bp1]');
  });

  it('amixes exactly the tones plus the main track', () => {
    expect(parts[3]).toBe('[a0][bp0][bp1]amix=inputs=3:duration=first:normalize=0[aout]');
  });
});

describe('what the builder refuses to render', () => {
  it('skips manual_review with a reason instead of guessing', () => {
    const graph = buildFilterComplex(plan([{ type: 'manual_review' }]));
    expect(graph.filterComplex).toBeNull();
    expect(graph.skipped[0].reason).toMatch(/manual review/i);
  });

  it('skips packaging_edit because a title is not in the file', () => {
    const graph = buildFilterComplex(plan([{ type: 'packaging_edit', surface: 'title' }]));
    expect(graph.applied).toHaveLength(0);
    expect(graph.skipped[0].reason).toMatch(/packaging/i);
  });

  it('skips trim rather than silently desynchronising the timeline', () => {
    const graph = buildFilterComplex(plan([{ type: 'trim' }]));
    expect(graph.filterComplex).toBeNull();
    expect(graph.skipped[0].reason).toMatch(/remaps the timeline/);
  });

  it('skips an inverted span', () => {
    const graph = buildFilterComplex(plan([{ type: 'mute', startMs: 5000, endMs: 4000 }]));
    expect(graph.filterComplex).toBeNull();
    expect(graph.skipped[0].reason).toMatch(/inverted/);
  });

  it('skips blur_region with no bounding box', () => {
    const graph = buildFilterComplex(plan([{ type: 'blur_region', box: undefined }]));
    expect(graph.skipped[0].reason).toMatch(/bounding box/);
  });

  it('returns a null graph for an empty plan', () => {
    const graph = buildFilterComplex(plan([]));
    expect(graph.filterComplex).toBeNull();
    expect(buildFfmpegArgs(graph)).not.toContain('-filter_complex');
  });
});

describe('blur regions', () => {
  const graph = buildFilterComplex(
    plan([
      { type: 'blur_region', surface: 'video_body', startMs: 2000, endMs: 4000, box: { x: 10, y: 20, w: 100, h: 50 } },
    ]),
  );

  it('crops, blurs and overlays gated to the span', () => {
    expect(graph.filterComplex).toContain('crop=100:50:10:20');
    expect(graph.filterComplex).toContain('boxblur=12');
    expect(graph.filterComplex).toContain("overlay=10:20:enable='between(t,2.00,4.00)'");
    expect(graph.videoOutLabel).toBe('[vout]');
  });

  it('re-encodes video only when it actually filtered video', () => {
    expect(graph.videoCopy).toBe(false);
    expect(buildFfmpegArgs(graph)).toContain('libx264');
  });
});

describe('helpers', () => {
  it('buildVolumeChain is comma-joined, not semicolon-joined', () => {
    const chain = buildVolumeChain([
      { findingId: 'a', type: 'mute', surface: 'audio', startMs: 0, endMs: 500 },
      { findingId: 'b', type: 'mute', surface: 'audio', startMs: 1000, endMs: 1500 },
    ]);
    // commas also appear inside between(t,S,E), so count the filters themselves
    expect(chain.match(/volume=enable/g)).toHaveLength(2);
    expect(chain).toContain(":volume=0,volume=enable");
    expect(chain).not.toContain(';');
  });

  it('buildBleepSources labels sequentially from zero', () => {
    const { labels } = buildBleepSources(
      [
        { findingId: 'a', type: 'bleep', surface: 'audio', startMs: 0, endMs: 500 },
        { findingId: 'b', type: 'bleep', surface: 'audio', startMs: 900, endMs: 1400 },
      ],
      { bleepHz: 1000, bleepGain: 0.35, sampleRate: 44100, blurStrength: 12 },
    );
    expect(labels).toEqual(['[bp0]', '[bp1]']);
  });

  it('describes the plan in plain language, including what it will not fix', () => {
    const graph = buildFilterComplex(
      plan([{ type: 'bleep' }, { type: 'bleep', startMs: 5000, endMs: 5400 }, { type: 'manual_review' }]),
    );
    expect(describeGraph(graph)).toBe('2 spans will be bleeped, 1 item needs manual review.');
  });
});
