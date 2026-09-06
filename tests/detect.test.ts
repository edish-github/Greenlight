/**
 * Defends invariant I3 and the product's central correctness claim: a single
 * mention is not a violation, and an early strong word is not a violation
 * either, because the rule that said so was deleted in July 2025.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadPack } from '../src/policy/loader';
import { detect } from '../src/pipeline/detect';
import { detectDensity } from '../src/pipeline/detect/density';
import { detectFocus } from '../src/pipeline/detect/focus';
import { detectPackaging } from '../src/pipeline/detect/packaging';
import type { Transcript, TranscriptWord } from '../src/types/transcript';

const pack = loadPack('src/policy/packs/youtube-afg-2026.09.yaml');

function build(text: string, wps = 2.6): Transcript {
  const tokens = text.trim().split(/\s+/);
  const step = Math.round(1000 / wps);
  const words: TranscriptWord[] = tokens.map((t, i) => ({
    text: t,
    startMs: i * step,
    endMs: i * step + step - 40,
  }));
  return {
    provider: 'fixture',
    model: 'test',
    language: 'en',
    durationMs: tokens.length * step,
    text,
    words,
    segments: [{ text, startMs: 0, endMs: tokens.length * step }],
  };
}

const filler = 'and then we talked about the thing for a while which was fine ';

describe('detection', () => {
  it('does not fire the density clause on one strong word at the very start', () => {
    const t = build(`Fuck ${filler.repeat(12)}`);
    expect(detectDensity(t, pack)).toHaveLength(0);
  });

  it('still surfaces that word as a candidate for the Gate to clear', () => {
    const t = build(`Fuck ${filler.repeat(12)}`);
    const res = detect({ transcript: t, pack });
    expect(res.candidates.map((c) => c.detector)).toContain('lexicon');
    expect(res.candidates[0].startMs).toBeLessThan(1000);
  });

  it('fires the density clause on repeated strong profanity', () => {
    const t = build('fuck fuck this fucking thing is fucked ' + filler.repeat(6));
    const c = detectDensity(t, pack);
    expect(c.length).toBeGreaterThan(0);
    expect(Number(c[0].metrics.strong_terms_in_span)).toBeGreaterThanOrEqual(4);
  });

  it('ignores obscured profanity, which the guidelines treat as ad-eligible', () => {
    const t = build(`f*ck f**k s*** ${filler.repeat(6)}`);
    const res = detect({ transcript: t, pack });
    expect(res.obscuredCount).toBeGreaterThan(0);
    expect(res.candidates.filter((c) => c.detector !== 'packaging')).toHaveLength(0);
  });

  it('ignores allowlisted abbreviations', () => {
    const t = build(`wtf af stfu ${filler.repeat(6)}`);
    expect(detect({ transcript: t, pack }).candidates).toHaveLength(0);
  });

  it('does not fire focus on a single topic mention', () => {
    const t = build(`there was a shooting mentioned once ${filler.repeat(20)}`);
    expect(detectFocus(t, pack)).toHaveLength(0);
  });

  it('fires focus on sustained topic presence', () => {
    const t = build(
      'the gunman was named and the death toll rose and the victims were identified and a memorial ' +
        'was held after the tragedy ' + filler.repeat(4),
    );
    const c = detectFocus(t, pack);
    expect(c.length).toBe(1);
    expect(c[0].categories).toContain('sensitive_events');
    expect(Number(c[0].metrics.distinct_terms)).toBeGreaterThanOrEqual(3);
  });

  it('fires packaging on a profane title, which survived the July 2025 relaxation', () => {
    const c = detectPackaging({ title: 'This patch is a fucking disaster' }, pack);
    expect(c).toHaveLength(1);
    expect(c[0].surface).toBe('title');
  });

  it('does not fire packaging on a clean title', () => {
    expect(detectPackaging({ title: 'This patch is a disaster' }, pack)).toHaveLength(0);
  });

  it('produces deterministic candidate ids for identical input', () => {
    const t = build('fuck fuck fucking fucked ' + filler.repeat(6));
    const a = detect({ transcript: t, pack, title: 'a shitty title' });
    const b = detect({ transcript: t, pack, title: 'a shitty title' });
    expect(b.candidates.map((c) => c.id)).toEqual(a.candidates.map((c) => c.id));
  });

  it('handles an empty transcript without dividing by zero', () => {
    const t = build('');
    expect(() => detect({ transcript: t, pack })).not.toThrow();
    expect(() => detect({ transcript: null, pack })).not.toThrow();
  });

  it('runs the whole fixture in under 100ms', () => {
    const t = JSON.parse(
      readFileSync('evals/fixtures/clip-01.transcript.json', 'utf8'),
    ) as Transcript;
    const res = detect({ transcript: t, pack, title: 'This patch is a fucking disaster' });
    expect(res.ms).toBeLessThan(100);
    expect(res.candidates.length).toBeGreaterThanOrEqual(4);
  });
});
