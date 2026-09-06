/**
 * Drop logging.
 *
 * Every rejection is appended to drops.jsonl with a reason. The aggregate count
 * is shown live during the scan and printed in the README, because a system
 * that reports what it rejected reads very differently from one that reports
 * only what it found.
 */
import { appendFileSync } from 'node:fs';
import type { Drop, DropReason } from '../../types/finding';

export class DropLog {
  readonly drops: Drop[] = [];
  private readonly path: string | null;
  private readonly scanId: string;

  constructor(scanId: string, path: string | null) {
    this.scanId = scanId;
    this.path = path;
  }

  add(reason: DropReason, detail: string, payload: unknown, candidateId?: string): void {
    const drop: Drop = {
      at: new Date().toISOString(),
      scanId: this.scanId,
      reason,
      candidateId,
      detail,
      payload,
    };
    this.drops.push(drop);
    if (this.path) {
      try {
        appendFileSync(this.path, `${JSON.stringify(drop)}\n`, 'utf8');
      } catch {
        // Never let telemetry break a scan.
      }
    }
  }

  get count(): number {
    return this.drops.length;
  }

  byReason(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const d of this.drops) out[d.reason] = (out[d.reason] ?? 0) + 1;
    return out;
  }
}
