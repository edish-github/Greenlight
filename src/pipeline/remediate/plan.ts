/**
 * Findings -> FixPlan.
 *
 * Product principle 2: the human commits every value. Nothing here is chosen
 * automatically. `selectedIds` comes from checkboxes the creator ticked, and
 * every finding they did not tick is recorded in `dismissed` rather than
 * silently ignored.
 */
import type { Finding, Remediation } from '../../types/finding';
import type { FixItem, FixPlan } from '../../types/fixplan';

/** Gap below which two spans of the same type are merged into one. */
export const MERGE_GAP_MS = 300;

/** Padding around a word so the filter does not clip the first phoneme. */
export const SPAN_PAD_MS = 60;

export interface PlanOptions {
  /** Merge spans closer together than this. Prevents audible filter chatter. */
  mergeGapMs?: number;
  padMs?: number;
  /** Per-finding override, e.g. the creator switched a bleep to a mute. */
  actions?: Record<string, Remediation>;
}

const AUTO_TYPES: Remediation[] = ['mute', 'bleep', 'blur_region'];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
 * Merge overlapping or near-adjacent spans of the same remediation type.
 *
 * Two bleeps 120ms apart produce two tone bursts with a gap you can hear as a
 * stutter, and two volume gates that fight at the boundary. Merging them into
 * one span is both cleaner audio and a shorter filter graph.
 */
export function mergeItems(items: FixItem[], gapMs: number): FixItem[] {
  const out: FixItem[] = [];
  const byKey = new Map<string, FixItem[]>();

  for (const item of items) {
    const key = `${item.type}|${item.surface}`;
    const list = byKey.get(key) ?? [];
    list.push(item);
    byKey.set(key, list);
  }

  for (const [, list] of byKey) {
    const sorted = [...list].sort((a, b) => a.startMs - b.startMs);
    let current: FixItem | null = null;

    for (const item of sorted) {
      if (!current) {
        current = { ...item, mergedFindingIds: [item.findingId] };
        continue;
      }
      // blur regions are only merged when they cover the same box
      const sameBox =
        item.type !== 'blur_region' ||
        JSON.stringify(item.box) === JSON.stringify(current.box);

      if (sameBox && item.startMs - current.endMs <= gapMs) {
        current.endMs = Math.max(current.endMs, item.endMs);
        current.mergedFindingIds = [...(current.mergedFindingIds ?? []), item.findingId];
      } else {
        out.push(current);
        current = { ...item, mergedFindingIds: [item.findingId] };
      }
    }
    if (current) out.push(current);
  }

  return out.sort((a, b) => a.startMs - b.startMs || a.type.localeCompare(b.type));
}

export function buildFixPlan(
  scanId: string,
  findings: Finding[],
  selectedIds: string[] | Set<string>,
  durationMs: number,
  options: PlanOptions = {},
): FixPlan {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const gapMs = options.mergeGapMs ?? MERGE_GAP_MS;
  const padMs = options.padMs ?? SPAN_PAD_MS;
  const actions = options.actions ?? {};

  const chosen = findings.filter((f) => selected.has(f.id) && f.state !== 'dismissed');
  const dismissed = findings.filter((f) => !selected.has(f.id)).map((f) => f.id);

  const auto: FixItem[] = [];
  const passthrough: FixItem[] = [];

  for (const finding of chosen) {
    const type = actions[finding.id] ?? finding.remediation;

    if (!AUTO_TYPES.includes(type)) {
      // packaging_edit and manual_review stay in the plan so the confirmation
      // screen can count them honestly, but they never reach the filter graph.
      passthrough.push({
        findingId: finding.id,
        type,
        surface: finding.surface,
        startMs: finding.startMs,
        endMs: finding.endMs,
        suggestion: type === 'packaging_edit' ? suggestPackagingEdit(finding) : undefined,
      });
      continue;
    }

    const startMs = clamp(finding.startMs - padMs, 0, Math.max(durationMs, 1));
    const endMs = clamp(finding.endMs + padMs, startMs + 1, Math.max(durationMs, startMs + 1));

    auto.push({
      findingId: finding.id,
      type,
      surface: finding.surface,
      startMs,
      endMs,
    });
  }

  return {
    scanId,
    createdAt: new Date().toISOString(),
    items: [...mergeItems(auto, gapMs), ...passthrough],
    dismissed,
  };
}

/**
 * A suggested replacement for a packaging surface. Returned only - Greenlight
 * never edits a title, because the title is not in the file and changing it is
 * the creator's decision on the upload form.
 */
export function suggestPackagingEdit(finding: Finding): string {
  const masked = finding.evidence.replace(
    /\b(\w)(\w*)(\w)\b/g,
    (whole, first: string, middle: string, last: string) =>
      middle.length >= 2 && /fuck|shit|cunt|bitch|dick|piss|bastard|twat/i.test(whole)
        ? `${first}${'*'.repeat(middle.length)}${last}`
        : whole,
  );
  return masked === finding.evidence
    ? 'Remove or obscure the flagged term before uploading.'
    : masked;
}

export interface PlanSummary {
  bleep: number;
  mute: number;
  blur: number;
  packaging: number;
  manual: number;
  renderable: number;
  text: string;
}

/** Plain language for the confirmation step, before anything is rendered. */
export function summarizePlan(plan: FixPlan): PlanSummary {
  const count = (t: string) => plan.items.filter((i) => i.type === t).length;
  const s: PlanSummary = {
    bleep: count('bleep'),
    mute: count('mute'),
    blur: count('blur_region'),
    packaging: count('packaging_edit'),
    manual: count('manual_review'),
    renderable: 0,
    text: '',
  };
  s.renderable = s.bleep + s.mute + s.blur;

  const bits: string[] = [];
  if (s.bleep) bits.push(`${s.bleep} span${s.bleep === 1 ? '' : 's'} will be bleeped`);
  if (s.mute) bits.push(`${s.mute} span${s.mute === 1 ? '' : 's'} muted`);
  if (s.blur) bits.push(`${s.blur} region${s.blur === 1 ? '' : 's'} blurred`);
  if (s.packaging) bits.push(`${s.packaging} title or thumbnail change suggested`);
  if (s.manual) bits.push(`${s.manual} item${s.manual === 1 ? '' : 's'} flagged for manual review`);
  s.text = bits.length ? `${bits.join(', ')}.` : 'Nothing selected.';
  return s;
}

/**
 * The editor export. A creator who would rather apply the cuts on their real
 * timeline in Premiere or Resolve gets the same spans as data instead of taking
 * our render.
 */
export interface SpanExport {
  scanId: string;
  generatedAt: string;
  durationMs: number;
  spans: {
    startMs: number;
    endMs: number;
    startTimecode: string;
    endTimecode: string;
    action: Remediation;
    findingIds: string[];
  }[];
}

export function timecode(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const f = total % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(3, '0')}`;
}

export function buildSpanExport(plan: FixPlan, durationMs: number): SpanExport {
  return {
    scanId: plan.scanId,
    generatedAt: new Date().toISOString(),
    durationMs,
    spans: plan.items
      .filter((i) => AUTO_TYPES.includes(i.type))
      .map((i) => ({
        startMs: i.startMs,
        endMs: i.endMs,
        startTimecode: timecode(i.startMs),
        endTimecode: timecode(i.endMs),
        action: i.type,
        findingIds: i.mergedFindingIds ?? [i.findingId],
      })),
  };
}
