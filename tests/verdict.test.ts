/**
 * Defends invariant I4: scoring is a pure function. Same findings, same
 * verdict, every time. This is what makes a cached scan safe to serve and a
 * demo safe to record.
 */
import { describe, expect, it } from 'vitest';
import { scoreVerdict, DISCLAIMER } from '../src/pipeline/score/verdict';
import { revenueAtRisk } from '../src/pipeline/score/revenue';
import type { Finding, Severity } from '../src/types/finding';

function finding(over: Partial<Finding> & { id: string; severity: Severity }): Finding {
  return {
    clauseId: 'AFG-LANG-002',
    clauseTitle: 'Profanity used repeatedly or throughout',
    clauseText: 'x'.repeat(30),
    clauseTextStatus: 'paraphrase',
    effectiveDate: '2025-07',
    sourceUrl: 'https://support.google.com/youtube/answer/6162278#inappropriate-language',
    surface: 'audio',
    startMs: 1000,
    endMs: 2000,
    evidence: 'evidence',
    evidenceType: 'transcript',
    confidence: 0.8,
    rationale: 'because',
    remediation: 'bleep',
    detector: 'density',
    candidateId: 'c1',
    state: 'open',
    ...over,
  } as Finding;
}

describe('verdict scoring', () => {
  it('is a pure function of its inputs', () => {
    const findings = [
      finding({ id: 'a', severity: 'limited_ads' }),
      finding({ id: 'b', severity: 'advisory', startMs: 5000 }),
    ];
    const first = scoreVerdict(findings);
    const second = scoreVerdict([...findings].reverse());
    expect(second).toEqual(first);
    expect(scoreVerdict(findings)).toEqual(first);
  });

  it('is red when any finding is no_ads', () => {
    const v = scoreVerdict([
      finding({ id: 'a', severity: 'limited_ads' }),
      finding({ id: 'b', severity: 'no_ads' }),
    ]);
    expect(v.status).toBe('red');
    expect(v.counts).toEqual({ no_ads: 1, limited_ads: 1, advisory: 0 });
  });

  it('is amber for limited_ads and green for nothing', () => {
    expect(scoreVerdict([finding({ id: 'a', severity: 'limited_ads' })]).status).toBe('amber');
    expect(scoreVerdict([]).status).toBe('green');
    expect(scoreVerdict([finding({ id: 'a', severity: 'advisory' })]).status).toBe('green');
  });

  it('ranks drivers by severity and caps them at three', () => {
    const v = scoreVerdict([
      finding({ id: 'a', severity: 'advisory' }),
      finding({ id: 'b', severity: 'no_ads' }),
      finding({ id: 'c', severity: 'limited_ads' }),
      finding({ id: 'd', severity: 'limited_ads', confidence: 0.4 }),
    ]);
    expect(v.drivers).toHaveLength(3);
    expect(v.drivers[0]).toBe('b');
  });

  it('excludes dismissed and resolved findings', () => {
    const v = scoreVerdict([
      finding({ id: 'a', severity: 'no_ads', state: 'dismissed' }),
      finding({ id: 'b', severity: 'no_ads', state: 'resolved' }),
    ]);
    expect(v.status).toBe('green');
  });

  it('lowers stated confidence when the scan ran degraded', () => {
    const f = [finding({ id: 'a', severity: 'limited_ads', confidence: 0.9 })];
    expect(scoreVerdict(f).confidence).toBe('high');
    expect(scoreVerdict(f, { degradedCount: 1 }).confidence).toBe('medium');
  });

  it('always carries the disclaimer', () => {
    expect(scoreVerdict([]).disclaimer).toBe(DISCLAIMER);
    expect(DISCLAIMER).toMatch(/does not predict/i);
  });
});

describe('revenue at risk', () => {
  it('returns a range, never a point estimate, with its assumption attached', () => {
    const r = revenueAtRisk([finding({ id: 'a', severity: 'limited_ads' })]);
    expect(r.high).toBeGreaterThan(r.low);
    expect(r.editable).toBe(true);
    expect(r.assumption).toMatch(/publishes no percentage/i);
  });

  it('is zero when there is nothing to lose', () => {
    const r = revenueAtRisk([]);
    expect(r.low).toBe(0);
    expect(r.high).toBe(0);
  });

  it('scales with the creator-supplied inputs', () => {
    const base = revenueAtRisk([finding({ id: 'a', severity: 'no_ads' })]);
    const bigger = revenueAtRisk([finding({ id: 'a', severity: 'no_ads' })], {
      expectedViews: 500_000,
      rpmLow: 2,
      rpmHigh: 8,
      currency: 'USD',
    });
    expect(bigger.high).toBe(base.high * 10);
  });
});
