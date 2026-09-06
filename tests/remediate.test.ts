/**
 * The planner and the diff. Together these are the loop the whole demo rests
 * on: what gets fixed, and whether the fix actually worked.
 */
import { describe, expect, it } from 'vitest';
import { buildFixPlan, buildSpanExport, mergeItems, summarizePlan, timecode } from '../src/pipeline/remediate/plan';
import { diffFindings } from '../src/pipeline/remediate/diff';
import type { Finding, Remediation, Severity } from '../src/types/finding';
import type { FixItem } from '../src/types/fixplan';

function finding(over: Partial<Finding> & { id: string }): Finding {
  return {
    clauseId: 'AFG-LANG-002',
    clauseTitle: 'Profanity used repeatedly or throughout',
    clauseText: 'x'.repeat(30),
    clauseTextStatus: 'paraphrase',
    effectiveDate: '2025-07',
    sourceUrl: 'https://support.google.com/youtube/answer/6162278#inappropriate-language',
    surface: 'audio',
    startMs: 55_000,
    endMs: 56_000,
    evidence: 'the same fucking bug',
    evidenceType: 'transcript',
    severity: 'limited_ads' as Severity,
    confidence: 0.8,
    rationale: 'four strong terms',
    remediation: 'bleep' as Remediation,
    detector: 'density',
    candidateId: 'c1',
    state: 'open',
    ...over,
  };
}

const item = (over: Partial<FixItem>): FixItem => ({
  findingId: 'f',
  type: 'bleep',
  surface: 'audio',
  startMs: 0,
  endMs: 500,
  ...over,
});

describe('span merging', () => {
  it('merges spans closer than the gap to stop audible bleep stutter', () => {
    const merged = mergeItems(
      [item({ findingId: 'a', startMs: 1000, endMs: 1500 }), item({ findingId: 'b', startMs: 1700, endMs: 2200 })],
      300,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ startMs: 1000, endMs: 2200 });
    expect(merged[0].mergedFindingIds).toEqual(['a', 'b']);
  });

  it('leaves clearly separated spans alone', () => {
    const merged = mergeItems(
      [item({ findingId: 'a', startMs: 1000, endMs: 1500 }), item({ findingId: 'b', startMs: 9000, endMs: 9500 })],
      300,
    );
    expect(merged).toHaveLength(2);
  });

  it('never merges across different remediation types', () => {
    const merged = mergeItems(
      [item({ type: 'bleep', startMs: 1000, endMs: 1500 }), item({ type: 'mute', startMs: 1600, endMs: 2000 })],
      300,
    );
    expect(merged).toHaveLength(2);
  });
});

describe('buildFixPlan', () => {
  const findings = [
    finding({ id: 'f1', startMs: 55_000, endMs: 55_400 }),
    finding({ id: 'f2', startMs: 55_500, endMs: 55_900 }),
    finding({ id: 'f3', clauseId: 'AFG-PKG-001', remediation: 'packaging_edit', surface: 'title', startMs: 0, endMs: 0 }),
    finding({ id: 'f4', clauseId: 'AFG-SENS-001', remediation: 'manual_review', startMs: 90_000, endMs: 102_000 }),
  ];

  it('only plans what the creator ticked, and logs the rest as dismissed', () => {
    const plan = buildFixPlan('s1', findings, ['f1', 'f3'], 120_000);
    expect(plan.dismissed).toEqual(['f2', 'f4']);
    expect(plan.items.map((i) => i.type).sort()).toEqual(['bleep', 'packaging_edit']);
  });

  it('pads spans so the filter does not clip the first phoneme', () => {
    const plan = buildFixPlan('s1', findings, ['f1'], 120_000, { mergeGapMs: 0 });
    expect(plan.items[0].startMs).toBe(55_000 - 60);
    expect(plan.items[0].endMs).toBe(55_400 + 60);
  });

  it('merges the two adjacent profanity spans into one rendered span', () => {
    const plan = buildFixPlan('s1', findings, ['f1', 'f2'], 120_000);
    const bleeps = plan.items.filter((i) => i.type === 'bleep');
    expect(bleeps).toHaveLength(1);
    expect(bleeps[0].mergedFindingIds).toEqual(['f1', 'f2']);
  });

  it('keeps packaging and manual items in the plan but out of the filter graph', () => {
    const plan = buildFixPlan('s1', findings, ['f3', 'f4'], 120_000);
    const s = summarizePlan(plan);
    expect(s.renderable).toBe(0);
    expect(s.packaging).toBe(1);
    expect(s.manual).toBe(1);
    expect(plan.items.find((i) => i.type === 'packaging_edit')?.suggestion).toBeTruthy();
  });

  it('honours a per-finding action override', () => {
    const plan = buildFixPlan('s1', findings, ['f1'], 120_000, { actions: { f1: 'mute' } });
    expect(plan.items[0].type).toBe('mute');
  });

  it('clamps spans to the duration of the file', () => {
    const plan = buildFixPlan('s1', [finding({ id: 'f1', startMs: 9_800, endMs: 20_000 })], ['f1'], 10_000);
    expect(plan.items[0].endMs).toBeLessThanOrEqual(10_000);
  });

  it('produces an editor span list with real timecodes', () => {
    const plan = buildFixPlan('s1', findings, ['f1', 'f2'], 120_000);
    const spans = buildSpanExport(plan, 120_000);
    expect(spans.spans[0].startTimecode).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    expect(spans.spans[0].findingIds).toEqual(['f1', 'f2']);
  });

  it('formats timecodes for an NLE', () => {
    expect(timecode(3_661_250)).toBe('01:01:01.250');
  });
});

describe('the re-scan diff', () => {
  const parent = [
    finding({ id: 'p1', startMs: 55_000, endMs: 56_000 }),
    finding({ id: 'p2', clauseId: 'AFG-SENS-001', startMs: 90_000, endMs: 102_000, surface: 'video_body' }),
  ];

  it('marks a finding resolved when it stops firing after the fix', () => {
    const diff = diffFindings(parent, [finding({ id: 'c1', clauseId: 'AFG-SENS-001', startMs: 90_100, endMs: 101_800, surface: 'video_body' })]);
    expect(diff.counts.resolved).toBe(1);
    expect(diff.resolved[0].id).toBe('p1');
    expect(diff.resolved[0].state).toBe('resolved');
  });

  it('turns everything green when every finding clears', () => {
    const diff = diffFindings(parent, []);
    expect(diff.allClear).toBe(true);
    expect(diff.counts.persisted).toBe(0);
  });

  it('reports a persisted finding honestly and escalates it to manual review', () => {
    const diff = diffFindings(parent, [finding({ id: 'c1', startMs: 55_200, endMs: 56_100 })]);
    expect(diff.counts.persisted).toBe(1);
    expect(diff.persisted[0].state).toBe('persisted');
    expect(diff.persisted[0].remediation).toBe('manual_review');
    expect(diff.allClear).toBe(false);
    expect(diff.summary).toMatch(/still firing/);
  });

  it('surfaces a finding the fix itself introduced', () => {
    const diff = diffFindings([], [finding({ id: 'c9', clauseId: 'AFG-VIOL-001', surface: 'video_body' })]);
    expect(diff.counts.fresh).toBe(1);
    expect(diff.allClear).toBe(false);
  });

  it('matches packaging findings on clause alone, since they have no span', () => {
    const pkg = finding({ id: 'p3', clauseId: 'AFG-PKG-001', surface: 'title', startMs: 0, endMs: 0 });
    const same = finding({ id: 'c3', clauseId: 'AFG-PKG-001', surface: 'title', startMs: 0, endMs: 0 });
    expect(diffFindings([pkg], [same]).counts.persisted).toBe(1);
    expect(diffFindings([pkg], []).counts.resolved).toBe(1);
  });

  it('refuses to call anything resolved when the re-scan ran blind', () => {
    // No transcript means nothing COULD have fired. A green timeline here would
    // be the most misleading output this product is capable of producing.
    const diff = diffFindings(parent, [], ['asr_unavailable']);
    expect(diff.trustworthy).toBe(false);
    expect(diff.counts.resolved).toBe(0);
    expect(diff.counts.unverified).toBe(2);
    expect(diff.allClear).toBe(false);
    expect(diff.summary).toMatch(/could not check it/);
  });

  it('still reports a persisted finding when the re-scan was blind', () => {
    const diff = diffFindings(parent, [finding({ id: 'c1', startMs: 55_200, endMs: 56_100 })], [
      'adjudication_unavailable',
    ]);
    expect(diff.counts.persisted).toBe(1);
    expect(diff.trustworthy).toBe(false);
  });

  it('treats a merely visual degradation as still verifiable for audio findings', () => {
    const diff = diffFindings(parent, [], ['visual_unavailable']);
    expect(diff.trustworthy).toBe(true);
    expect(diff.counts.resolved).toBe(2);
  });

  it('ignores findings the creator had already dismissed', () => {
    const diff = diffFindings([finding({ id: 'p1', state: 'dismissed' })], []);
    expect(diff.counts.resolved).toBe(0);
  });
});
