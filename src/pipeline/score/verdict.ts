/**
 * Scoring: findings -> verdict.
 *
 * A pure function. Same findings always produce the same verdict, which is
 * invariant I4 and what tests/verdict.test.ts asserts. It makes no new claims;
 * it only aggregates claims that already survived the Gate.
 */
import { SEVERITY_RANK, type Finding } from '../../types/finding';
import type { Verdict } from '../../types/verdict';
import { DEFAULT_REVENUE_INPUTS, revenueAtRisk, type RevenueInputs } from './revenue';

export const DISCLAIMER =
  'Greenlight locates spans and cites clauses. It does not predict YouTube\'s decision. ' +
  'YouTube reviews the whole video in context, its systems can be wrong, and it makes the final call.';

const HEADLINES = {
  red: 'Predicted risk: No ads (Red)',
  amber: 'Predicted risk: Limited ads (Amber)',
  green: 'Predicted risk: Low (Green)',
} as const;

function confidenceLabel(active: Finding[], degradedCount: number): Verdict['confidence'] {
  if (!active.length) return degradedCount > 0 ? 'low' : 'medium';
  const mean = active.reduce((s, f) => s + f.confidence, 0) / active.length;
  if (degradedCount > 0) return mean >= 0.8 ? 'medium' : 'low';
  if (mean >= 0.8) return 'high';
  if (mean >= 0.6) return 'medium';
  return 'low';
}

export interface ScoreOptions {
  revenueInputs?: RevenueInputs;
  /** Number of degraded flags on the scan. Lowers stated confidence, never hidden. */
  degradedCount?: number;
}

export function scoreVerdict(findings: Finding[], opts: ScoreOptions = {}): Verdict {
  const active = findings.filter((f) => f.state !== 'dismissed' && f.state !== 'resolved');

  const counts = { no_ads: 0, limited_ads: 0, advisory: 0 };
  for (const f of active) counts[f.severity]++;

  const status: Verdict['status'] =
    counts.no_ads > 0 ? 'red' : counts.limited_ads > 0 ? 'amber' : 'green';

  const drivers = [...active]
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        b.confidence - a.confidence ||
        a.startMs - b.startMs ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 3)
    .map((f) => f.id);

  return {
    status,
    headline: HEADLINES[status],
    drivers,
    confidence: confidenceLabel(active, opts.degradedCount ?? 0),
    counts,
    revenueAtRisk: revenueAtRisk(active, opts.revenueInputs ?? DEFAULT_REVENUE_INPUTS),
    disclaimer: DISCLAIMER,
  };
}
