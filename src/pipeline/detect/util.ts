import { sha256String } from '../../lib/hash';
import { normalizeToken } from '../../policy/lexicon';
import type { Candidate } from '../../types/finding';
import type { Transcript, TranscriptWord } from '../../types/transcript';

export interface PhraseMatch {
  term: string;
  startIndex: number;
  endIndex: number;
  startMs: number;
  endMs: number;
  raw: string;
}

/**
 * Match single terms and multi-word phrases (up to 3 words) over the word
 * stream. Deterministic, sub-millisecond, and free - which is the whole point
 * of invariant I3: cheap detectors generate candidates, the model only
 * adjudicates.
 */
export function matchPhrases(words: TranscriptWord[], terms: string[]): PhraseMatch[] {
  const byLength = new Map<number, Set<string>>();
  for (const t of terms) {
    const parts = t.trim().split(/\s+/).map(normalizeToken).filter(Boolean);
    if (!parts.length) continue;
    const n = Math.min(parts.length, 3);
    const key = parts.slice(0, 3).join(' ');
    if (!byLength.has(n)) byLength.set(n, new Set());
    byLength.get(n)!.add(key);
  }

  const norm = words.map((w) => normalizeToken(w.text));
  const out: PhraseMatch[] = [];

  for (let i = 0; i < words.length; i++) {
    for (let n = 3; n >= 1; n--) {
      const set = byLength.get(n);
      if (!set || i + n > words.length) continue;
      const gram = norm.slice(i, i + n).join(' ');
      if (set.has(gram)) {
        out.push({
          term: gram,
          startIndex: i,
          endIndex: i + n - 1,
          startMs: words[i].startMs,
          endMs: words[i + n - 1].endMs,
          raw: words.slice(i, i + n).map((w) => w.text).join(' '),
        });
        break; // longest match wins at this position
      }
    }
  }
  return out;
}

/** Quote a window of transcript around a span, for the evidence field. */
export function quoteAround(
  t: Transcript,
  startMs: number,
  endMs: number,
  padMs = 2500,
  maxChars = 280,
): string {
  const text = t.words
    .filter((w) => w.endMs >= startMs - padMs && w.startMs <= endMs + padMs)
    .map((w) => w.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}\u2026` : text;
}

/** Deterministic candidate id. Same inputs => same id, which invariant I4 needs. */
export function candidateId(parts: {
  detector: string;
  categories: string[];
  startMs: number;
  endMs: number;
}): string {
  const key = `${parts.detector}|${parts.categories.join('+')}|${parts.startMs}|${parts.endMs}`;
  return `${parts.detector.slice(0, 3)}_${sha256String(key).slice(0, 10)}`;
}

/** Merge candidates of the same detector+category whose spans touch or overlap. */
export function mergeSpans(
  spans: { startMs: number; endMs: number }[],
  gapMs = 0,
): { startMs: number; endMs: number }[] {
  if (!spans.length) return [];
  const sorted = [...spans].sort((a, b) => a.startMs - b.startMs);
  const out = [{ ...sorted[0] }];
  for (const s of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (s.startMs <= last.endMs + gapMs) {
      last.endMs = Math.max(last.endMs, s.endMs);
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

export function clampSpan(
  span: { startMs: number; endMs: number },
  durationMs: number,
): { startMs: number; endMs: number } {
  const start = Math.max(0, Math.min(span.startMs, durationMs));
  const end = Math.max(start + 1, Math.min(span.endMs, durationMs));
  return { startMs: Math.round(start), endMs: Math.round(end) };
}

export function sortCandidates(list: Candidate[]): Candidate[] {
  return [...list].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
}
