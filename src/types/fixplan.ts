import type { Remediation, Surface } from './finding';

/** Day 2 contract. Declared now so the report screen can be built against it. */
export interface FixItem {
  findingId: string;
  type: Remediation;
  surface: Surface;
  startMs: number;
  endMs: number;
  /** packaging_edit only: suggested replacement text. Never applied automatically. */
  suggestion?: string;
  /** blur_region only. */
  box?: { x: number; y: number; w: number; h: number };
  /**
   * Set when plan.ts merges near-adjacent spans of the same type. The UI needs
   * it to keep showing which findings a single rendered span actually covers.
   */
  mergedFindingIds?: string[];
}

export interface FixPlan {
  scanId: string;
  createdAt: string;
  items: FixItem[];
  dismissed: string[]; // finding ids the creator explicitly rejected; logged, never silent
}
