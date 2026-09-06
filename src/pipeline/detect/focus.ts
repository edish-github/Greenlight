/**
 * Focus detector: sustained presence of a topic across a sliding window.
 *
 * A single mention never produces a candidate. That is a deliberate design
 * decision and it is the second most common failure of naive keyword checkers:
 * the word "shooting" appearing once in a 20 minute video is not a
 * sensitive-events violation, and treating it as one destroys trust in every
 * other finding on the screen.
 */
import { threshold, type LoadedPack } from '../../policy/loader';
import { loadTopicLexicon } from '../../policy/lexicon';
import type { Candidate } from '../../types/finding';
import type { Transcript } from '../../types/transcript';
import { candidateId, clampSpan, matchPhrases, quoteAround, sortCandidates } from './util';

export function detectFocus(transcript: Transcript, pack: LoadedPack): Candidate[] {
  const clauses = pack.pack.clauses.filter((c) => c.detector === 'focus');
  if (!clauses.length || !transcript.words.length) return [];

  const topics = loadTopicLexicon();
  const duration = Math.max(transcript.durationMs, transcript.words.at(-1)?.endMs ?? 0, 1);
  const out: Candidate[] = [];

  // One pass per category, not per clause: several clauses can share a category
  // and the Gate decides which of them (if any) the span actually matches.
  const categories = [...new Set(clauses.map((c) => c.category))];

  for (const category of categories) {
    const terms = topics.categories[category] ?? [];
    if (!terms.length) continue;

    const catClauses = clauses.filter((c) => c.category === category);
    const windowMs = Math.min(...catClauses.map((c) => threshold(c, 'window_ms', 60_000)));
    const hopMs = Math.min(...catClauses.map((c) => threshold(c, 'hop_ms', 15_000)));
    const minTerms = Math.min(...catClauses.map((c) => threshold(c, 'min_terms_in_window', 4)));
    const minDistinct = Math.min(...catClauses.map((c) => threshold(c, 'min_distinct_terms', 3)));

    const matches = matchPhrases(transcript.words, terms);
    if (matches.length < minTerms) continue;

    const windows: { startMs: number; endMs: number; total: number; distinct: number; terms: string[] }[] = [];

    for (let start = 0; start < duration; start += hopMs) {
      const end = start + windowMs;
      const inWindow = matches.filter((m) => m.startMs >= start && m.startMs < end);
      if (inWindow.length < minTerms) continue;
      const distinct = new Set(inWindow.map((m) => m.term));
      if (distinct.size < minDistinct) continue;
      windows.push({
        startMs: inWindow[0].startMs,
        endMs: inWindow[inWindow.length - 1].endMs,
        total: inWindow.length,
        distinct: distinct.size,
        terms: [...distinct],
      });
    }
    if (!windows.length) continue;

    const merged: typeof windows = [];
    for (const w of windows.sort((a, b) => a.startMs - b.startMs)) {
      const last = merged[merged.length - 1];
      if (last && w.startMs <= last.endMs) {
        last.endMs = Math.max(last.endMs, w.endMs);
        last.total = Math.max(last.total, w.total);
        last.distinct = Math.max(last.distinct, w.distinct);
        last.terms = [...new Set([...last.terms, ...w.terms])];
      } else merged.push({ ...w });
    }

    for (const w of merged) {
      const span = clampSpan(w, Math.max(duration, w.endMs));
      out.push({
        id: candidateId({
          detector: 'focus',
          categories: [category],
          startMs: span.startMs,
          endMs: span.endMs,
        }),
        detector: 'focus',
        surface: 'video_body',
        startMs: span.startMs,
        endMs: span.endMs,
        evidence: quoteAround(transcript, span.startMs, span.endMs, 0),
        evidenceType: 'transcript',
        categories: [category],
        metrics: {
          matched_terms: w.total,
          distinct_terms: w.distinct,
          terms: w.terms.slice(0, 12).join(', '),
          window_seconds: Math.round(windowMs / 1000),
          threshold_min_terms: minTerms,
          threshold_min_distinct: minDistinct,
          span_seconds: Math.round((span.endMs - span.startMs) / 100) / 10,
        },
      });
    }
  }
  return sortCandidates(out);
}
