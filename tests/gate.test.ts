/**
 * Defends invariant I2 at the reasoning boundary.
 *
 * Every test here feeds the Gate mock model output. No API key, no network.
 * The headline case: a model that insists on the deleted first-7-seconds rule
 * cannot get it onto the screen.
 */
import { describe, expect, it } from 'vitest';
import { adjudicate } from '../src/pipeline/adjudicate/adjudicate';
import { loadPack } from '../src/policy/loader';
import type { ToolInvoker } from '../src/lib/llm';
import type { Candidate } from '../src/types/finding';
import type { Transcript } from '../src/types/transcript';

const pack = loadPack('src/policy/packs/youtube-afg-2026.09.yaml');

const transcript: Transcript = {
  provider: 'fixture',
  model: 'test',
  language: 'en',
  durationMs: 120_000,
  text: 'test transcript',
  words: [{ text: 'test', startMs: 0, endMs: 400 }],
  segments: [],
};

const candidate: Candidate = {
  id: 'den_test01',
  detector: 'density',
  surface: 'audio',
  startMs: 55_000,
  endMs: 62_000,
  evidence: 'a stretch of repeated strong profanity',
  evidenceType: 'transcript',
  categories: ['inappropriate_language'],
  metrics: { strong_terms_in_span: 4, strong_terms_per_minute: 8 },
};

function invokerReturning(findings: unknown[]): ToolInvoker {
  return async () => ({
    toolInput: { findings },
    stopReason: 'tool_use',
    usage: { input: 0, output: 0 },
    ms: 1,
    attempts: 1,
  });
}

const valid = {
  clause_id: 'AFG-LANG-002',
  surface: 'audio',
  start_ms: 55_000,
  end_ms: 62_000,
  evidence: 'repeated strong profanity',
  severity: 'limited_ads',
  confidence: 0.82,
  rationale: 'four strong terms in seven seconds',
};

async function run(findings: unknown[]) {
  return adjudicate({
    scanId: 'test',
    candidates: [candidate],
    pack,
    transcript,
    durationMs: 120_000,
    dropsPath: null,
    invoke: invokerReturning(findings),
  });
}

describe('the Gate', () => {
  it('accepts a well-formed finding citing a live clause', async () => {
    const res = await run([valid]);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0].clauseId).toBe('AFG-LANG-002');
    expect(res.drops.count).toBe(0);
  });

  it('takes severity and remediation from the pack, not from the model', async () => {
    const res = await run([{ ...valid, severity: 'advisory' }]);
    expect(res.findings[0].severity).toBe('limited_ads'); // pack wins
    expect(res.findings[0].remediation).toBe('bleep');
    expect(res.findings[0].effectiveDate).toBe('2025-07');
  });

  it('drops a fabricated clause id', async () => {
    const res = await run([{ ...valid, clause_id: 'AFG-FAKE-999' }]);
    expect(res.findings).toHaveLength(0);
    expect(res.drops.byReason().unknown_clause).toBe(1);
    expect(res.drops.drops[0].detail).toContain('AFG-FAKE-999');
  });

  it('drops the deleted first-7-seconds rule even when the model insists on it', async () => {
    const res = await run([
      {
        ...valid,
        clause_id: 'AFG-LANG-DEP-7SEC',
        start_ms: 0,
        end_ms: 7000,
        rationale: 'strong profanity within the first 7 seconds',
        confidence: 0.99,
      },
    ]);
    expect(res.findings).toHaveLength(0);
    expect(res.drops.byReason().unknown_clause).toBe(1);
  });

  it('drops a clause that exists but was not offered for this candidate', async () => {
    const res = await run([{ ...valid, clause_id: 'AFG-FIRE-001' }]);
    expect(res.findings).toHaveLength(0);
    expect(res.drops.byReason().unknown_clause).toBe(1);
  });

  it('drops an inverted span', async () => {
    const res = await run([{ ...valid, start_ms: 62_000, end_ms: 55_000 }]);
    expect(res.drops.byReason().bad_span).toBe(1);
  });

  it('drops a span past the end of the video', async () => {
    const res = await run([{ ...valid, start_ms: 100, end_ms: 900_000 }]);
    expect(res.drops.byReason().out_of_range).toBe(1);
  });

  it('drops output that fails the schema instead of coercing it', async () => {
    const res = await run([{ clause_id: 'AFG-LANG-002', surface: 'audio' }]);
    expect(res.findings).toHaveLength(0);
    expect(res.drops.byReason().schema).toBe(1);
  });

  it('drops a clause applied to a surface it does not cover', async () => {
    const res = await run([{ ...valid, surface: 'thumbnail' }]);
    expect(res.findings).toHaveLength(0);
    expect(res.drops.count).toBe(1);
  });

  it('treats an empty findings array as a normal cleared candidate, not an error', async () => {
    const res = await run([]);
    expect(res.findings).toHaveLength(0);
    expect(res.drops.count).toBe(0);
    expect(res.clearedCandidates).toBe(1);
  });

  it('records a provider failure as a drop rather than failing the scan', async () => {
    const res = await adjudicate({
      scanId: 'test',
      candidates: [candidate],
      pack,
      transcript,
      durationMs: 120_000,
      dropsPath: null,
      invoke: async () => {
        throw new Error('429 rate limited');
      },
    });
    expect(res.findings).toHaveLength(0);
    expect(res.drops.byReason().provider_error).toBe(1);
  });
});
