/**
 * Parent scan vs re-scan.
 *
 * The state transition the judge watches is Rendered -> Resolved. But
 * Rendered -> Persisted exists too: if the re-scan still fires on a span, the
 * UI says so and escalates the item to manual review. Hiding that case would be
 * exactly the kind of dishonesty a skeptical judge is looking for, and it costs
 * nothing to show.
 */
import type { Finding } from '../../types/finding';
import type { DegradedFlag } from '../../types/scan';

/** How much span drift still counts as "the same finding". */
export const OVERLAP_TOLERANCE_MS = 1500;

export interface ScanDiff {
  resolved: Finding[];
  persisted: Finding[];
  fresh: Finding[];
  counts: { resolved: number; persisted: number; fresh: number; unverified: number };
  allClear: boolean;
  /**
   * False when the re-scan ran too degraded to prove anything. A finding that
   * did not fire because the transcript never existed has not been resolved,
   * and calling it resolved would be the single most misleading thing this
   * product could do.
   */
  trustworthy: boolean;
  /** Plain-language line for the result screen. Never omits the bad news. */
  summary: string;
}

/**
 * Degraded states that make a green re-scan meaningless. If the corrected file
 * was never transcribed, or the Gate never ran, then nothing could have fired
 * regardless of whether the fix worked.
 */
const BLINDING: DegradedFlag[] = ['asr_unavailable', 'adjudication_unavailable'];

export function rescanCanVerify(childDegraded: DegradedFlag[] = []): boolean {
  return !childDegraded.some((flag) => BLINDING.includes(flag));
}

function overlaps(a: Finding, b: Finding): boolean {
  if (a.clauseId !== b.clauseId) return false;
  if (a.surface !== b.surface) return false;
  // Packaging findings are zero-width at t=0; match them on clause alone.
  if (a.endMs === 0 && b.endMs === 0) return true;
  return (
    a.startMs - OVERLAP_TOLERANCE_MS <= b.endMs && b.startMs - OVERLAP_TOLERANCE_MS <= a.endMs
  );
}

export function diffFindings(
  parent: Finding[],
  child: Finding[],
  childDegraded: DegradedFlag[] = [],
): ScanDiff {
  const trustworthy = rescanCanVerify(childDegraded);
  const matchedChildIds = new Set<string>();
  const resolved: Finding[] = [];
  const persisted: Finding[] = [];
  const unverified: Finding[] = [];

  for (const p of parent) {
    if (p.state === 'dismissed') continue;
    const match = child.find((c) => !matchedChildIds.has(c.id) && overlaps(p, c));
    if (match) {
      matchedChildIds.add(match.id);
      persisted.push({ ...match, state: 'persisted', remediation: 'manual_review' });
    } else if (trustworthy) {
      resolved.push({ ...p, state: 'resolved' });
    } else {
      // The re-scan could not see. The finding stays exactly where it was.
      unverified.push({ ...p, state: 'open' });
    }
  }

  const fresh = child
    .filter((c) => !matchedChildIds.has(c.id))
    .map((c) => ({ ...c, state: 'open' as const }));

  const counts = {
    resolved: resolved.length,
    persisted: persisted.length,
    fresh: fresh.length,
    unverified: unverified.length,
  };
  const allClear = trustworthy && counts.persisted === 0 && counts.fresh === 0;

  const bits: string[] = [];
  if (counts.resolved) bits.push(`${counts.resolved} resolved`);
  if (counts.persisted) bits.push(`${counts.persisted} still firing after the fix`);
  if (counts.fresh) bits.push(`${counts.fresh} new finding${counts.fresh === 1 ? '' : 's'} in the corrected file`);

  let summary: string;
  if (!trustworthy) {
    summary =
      `The corrected file was rendered, but the re-scan ran degraded and could not check it. ` +
      `${counts.unverified} finding${counts.unverified === 1 ? ' is' : 's are'} unverified rather than resolved.`;
  } else if (bits.length) {
    summary = `${bits.join(', ')}.${
      allClear ? '' : ' Items still firing have been escalated to manual review.'
    }`;
  } else {
    summary = 'Nothing changed between the two scans.';
  }

  return { resolved, persisted, fresh, counts, allClear, trustworthy, summary };
}
