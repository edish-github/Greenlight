import type { Finding } from './finding';

export interface RevenueAtRisk {
  low: number;
  high: number;
  currency: string;
  /** Rendered verbatim in the UI. Never hidden, never summarised away. */
  assumption: string;
  editable: true;
  inputs: {
    expectedViews: number;
    rpmLow: number;
    rpmHigh: number;
    lossShareLow: number;
    lossShareHigh: number;
  };
}

export interface Verdict {
  status: 'green' | 'amber' | 'red';
  headline: string;
  drivers: string[]; // finding ids, max 3
  confidence: 'low' | 'medium' | 'high';
  counts: Record<'no_ads' | 'limited_ads' | 'advisory', number>;
  revenueAtRisk: RevenueAtRisk;
  /** Part of the data contract, not a UI decision. It cannot be refactored away. */
  disclaimer: string;
}

export interface ScoredReport {
  verdict: Verdict;
  findings: Finding[];
}
