/**
 * The product's central claim, asserted end to end.
 *
 * A strong profanity at 0:01 followed by a clean video must produce NO finding,
 * because YouTube deleted the first-7-seconds rule in July 2025. Every naive
 * transcript-plus-LLM checker gets this wrong, and this test is what stops
 * Greenlight from regressing into one.
 *
 * The adjudicator here is an ADVERSARIAL stub: it tries to cite the dead rule
 * on every single candidate. Even so, nothing reaches the report.
 */
import { describe, expect, it } from 'vitest';
import { adjudicate } from '../src/pipeline/adjudicate/adjudicate';
import { detect } from '../src/pipeline/detect';
import { loadPack } from '../src/policy/loader';
import { scoreVerdict } from '../src/pipeline/score/verdict';
import type { ToolInvoker } from '../src/lib/llm';
import type { Transcript, TranscriptWord } from '../src/types/transcript';

const pack = loadPack('src/policy/packs/youtube-afg-2026.09.yaml');

function build(text: string): Transcript {
  const tokens = text.trim().split(/\s+/);
  const words: TranscriptWord[] = tokens.map((t, i) => ({
    text: t,
    startMs: i * 380,
    endMs: i * 380 + 340,
  }));
  return {
    provider: 'fixture',
    model: 'test',
    language: 'en',
    durationMs: tokens.length * 380,
    text,
    words,
    segments: [{ text, startMs: 0, endMs: tokens.length * 380 }],
  };
}

/** A model that has read every 2023 creator blog and believes all of it. */
const staleModel: ToolInvoker = async (req) => ({
  toolInput: {
    findings: [
      {
        clause_id: 'AFG-LANG-DEP-7SEC',
        surface: 'audio',
        start_ms: 0,
        end_ms: 7000,
        evidence: 'strong profanity in the opening seconds',
        severity: 'limited_ads',
        confidence: 0.97,
        rationale: 'Strong profanity within the first 7 seconds limits monetization.',
      },
    ],
  },
  stopReason: 'tool_use',
  usage: { input: 0, output: 0 },
  ms: 1,
  attempts: 1,
});

describe('the deleted first-7-seconds rule', () => {
  const transcript = build(
    'Fuck it, here we go. Today I want to walk through the three changes that landed this week ' +
      'and what each of them means for the way you plan a build. None of this is complicated but ' +
      'the ordering matters quite a lot and most people get it backwards on the first attempt.',
  );

  it('is not in the allowlist, so it cannot be cited', () => {
    expect(pack.allowlist.has('AFG-LANG-DEP-7SEC')).toBe(false);
  });

  it('produces a green verdict even when the adjudicator insists on the dead rule', async () => {
    const detected = detect({ transcript, pack });
    expect(detected.candidates.length).toBeGreaterThan(0); // the word IS detected

    const gate = await adjudicate({
      scanId: 'seven-second',
      candidates: detected.candidates,
      pack,
      transcript,
      durationMs: transcript.durationMs,
      dropsPath: null,
      invoke: staleModel,
    });

    expect(gate.findings).toHaveLength(0);
    expect(gate.drops.byReason().unknown_clause).toBe(detected.candidates.length);
    expect(scoreVerdict(gate.findings).status).toBe('green');
  });

  it('keeps the deletion documented so the UI can explain itself', () => {
    const dep = pack.pack.deprecated_rules.find((d) => d.id === 'AFG-LANG-DEP-7SEC')!;
    expect(dep.removed_on).toBe('2025-07');
    expect(dep.source_url).toContain('support.google.com');
    expect(dep.why_people_still_believe_it.length).toBeGreaterThan(20);
  });
});
