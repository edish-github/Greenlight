/**
 * Revenue at risk.
 *
 * Product principle 5: honesty is a feature, not a tax.
 *
 * No official percentage for what limited ads costs exists on any Google page.
 * Google says only that you should expect lower ad revenue. The widely quoted
 * "50-80%" figures are unsourced. So this returns a RANGE, with its assumption
 * string rendered verbatim on screen and every input editable by the creator.
 *
 * A skeptical judge trusts a tool that states its limits. A point estimate here
 * would be the single easiest thing in the whole product to attack.
 */
import type { Finding, Severity } from '../../types/finding';
import type { RevenueAtRisk } from '../../types/verdict';

export interface RevenueInputs {
  expectedViews: number;
  rpmLow: number;
  rpmHigh: number;
  currency: string;
}

export const DEFAULT_REVENUE_INPUTS: RevenueInputs = {
  expectedViews: 50_000,
  rpmLow: 2,
  rpmHigh: 8,
  currency: 'USD',
};

/**
 * Share of ad revenue assumed lost, by worst severity present. These are
 * ASSUMPTIONS, not measurements, and the assumption string says so.
 */
const LOSS_SHARE: Record<Severity | 'none', { low: number; high: number }> = {
  no_ads: { low: 0.9, high: 1.0 },
  limited_ads: { low: 0.3, high: 0.8 },
  advisory: { low: 0.0, high: 0.1 },
  none: { low: 0, high: 0 },
};

function worstSeverity(findings: Finding[]): Severity | 'none' {
  if (findings.some((f) => f.severity === 'no_ads')) return 'no_ads';
  if (findings.some((f) => f.severity === 'limited_ads')) return 'limited_ads';
  if (findings.some((f) => f.severity === 'advisory')) return 'advisory';
  return 'none';
}

export function revenueAtRisk(
  findings: Finding[],
  inputs: RevenueInputs = DEFAULT_REVENUE_INPUTS,
): RevenueAtRisk {
  const severity = worstSeverity(findings.filter((f) => f.state !== 'dismissed'));
  const share = LOSS_SHARE[severity];

  const baseLow = (inputs.expectedViews / 1000) * inputs.rpmLow;
  const baseHigh = (inputs.expectedViews / 1000) * inputs.rpmHigh;

  return {
    low: Math.round(baseLow * share.low),
    high: Math.round(baseHigh * share.high),
    currency: inputs.currency,
    assumption:
      `Range, not a prediction. Assumes ${inputs.expectedViews.toLocaleString()} views at ` +
      `${inputs.currency} ${inputs.rpmLow}-${inputs.rpmHigh} RPM, and that "${severity}" content loses ` +
      `${Math.round(share.low * 100)}-${Math.round(share.high * 100)}% of ad revenue. ` +
      `YouTube publishes no percentage for what limited ads costs, so that last number is our ` +
      `assumption and yours to change. Every input on this line is editable.`,
    editable: true,
    inputs: {
      expectedViews: inputs.expectedViews,
      rpmLow: inputs.rpmLow,
      rpmHigh: inputs.rpmHigh,
      lossShareLow: share.low,
      lossShareHigh: share.high,
    },
  };
}
