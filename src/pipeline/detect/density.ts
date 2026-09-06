/**
 * Density detector: is profanity used repeatedly or throughout?
 *
 * Every threshold is read from the clause in the YAML pack. None of them are
 * literals in this file. Invariant I1 means that retuning the detector is a
 * data change with a version bump and an automatic cache invalidation, not a
 * code change that silently alters what every past scan would have said.
 */
import { threshold, type LoadedPack } from '../../policy/loader';
import type { Clause } from '../../policy/types';
import type { Candidate } from '../../types/finding';
import type { Transcript } from '../../types/transcript';
import { candidateId, clampSpan, quoteAround, sortCandidates } from './util';
import { scanLexicon, type LexiconScan } from './lexicon';

function sentencesAffected(transcript: Transcript, scan: LexiconScan): number {
  const segs = transcript.segments;
  if (!segs.length) return 0;
  const affected = segs.filter((s) =>
    scan.hits.some((h) => h.tier === 'strong' && h.startMs >= s.startMs && h.endMs <= s.endMs),
  ).length;
  return affected / segs.length;
}

export function detectDensity(
  transcript: Transcript,
  pack: LoadedPack,
  scan: LexiconScan = scanLexicon(transcript),
): Candidate[] {
  const clauses = pack.pack.clauses.filter((c) => c.detector === 'density');
  if (!clauses.length || !transcript.words.length) return [];

  const out: Candidate[] = [];
  const share = sentencesAffected(transcript, scan);

  for (const clause of clauses) {
    const windowMs = threshold(clause, 'window_ms', 60_000);
    const hopMs = threshold(clause, 'hop_ms', 15_000);
    const perMinute = threshold(clause, 'strong_terms_per_minute', 4);
    const minInWindow = threshold(clause, 'min_strong_terms_in_window', 4);
    const shareLimit = threshold(clause, 'share_of_sentences_affected', 0.3);

    const maxGapMs = threshold(clause, 'max_gap_ms', 20_000);
    const rateFloorMs = threshold(clause, 'rate_floor_ms', 30_000);

    const strong = scan.hits.filter((h) => h.tier === 'strong' || h.tier === 'slur');
    if (!strong.length) continue;

    const duration = Math.max(transcript.durationMs, transcript.words.at(-1)?.endMs ?? 0);
    const raw: { startMs: number; endMs: number; count: number }[] = [];

    for (let start = 0; start < Math.max(duration, 1); start += hopMs) {
      const end = start + windowMs;
      const inWindow = strong.filter((h) => h.startMs >= start && h.startMs < end);
      if (!inWindow.length) continue;
      const rate = inWindow.length / (windowMs / 60_000);
      const overRate = rate >= perMinute && inWindow.length >= minInWindow;
      const overShare = share >= shareLimit && inWindow.length >= minInWindow;
      if (!overRate && !overShare) continue;

      // Tighten the span to the dense cluster inside the window. Without this a
      // single word at 0:01 and a rant at 0:55 produce one 59-second red band
      // across an intro that is clean, which is both wrong on screen and the
      // kind of imprecision that makes a creator stop trusting the timeline.
      let cluster: typeof inWindow = [];
      const clusters: (typeof inWindow)[] = [];
      for (const hit of inWindow) {
        if (cluster.length && hit.startMs - cluster[cluster.length - 1].endMs > maxGapMs) {
          clusters.push(cluster);
          cluster = [];
        }
        cluster.push(hit);
      }
      if (cluster.length) clusters.push(cluster);

      for (const c of clusters) {
        if (c.length < minInWindow) continue;
        raw.push({ startMs: c[0].startMs, endMs: c[c.length - 1].endMs, count: c.length });
      }
    }
    if (!raw.length) continue;

    // Merge overlapping windows into one candidate per continuous stretch.
    const merged: typeof raw = [];
    for (const w of raw.sort((a, b) => a.startMs - b.startMs)) {
      const last = merged[merged.length - 1];
      if (last && w.startMs <= last.endMs) {
        last.endMs = Math.max(last.endMs, w.endMs);
        last.count = Math.max(last.count, w.count);
      } else merged.push({ ...w });
    }

    for (const m of merged) {
      const span = clampSpan(m, Math.max(duration, m.endMs));
      // Rate is computed over the span or a floor, whichever is longer. Without
      // the floor a 4-second burst reads as 60 terms per minute, which is a
      // true number that misleads every human who sees it.
      const spanMinutes = Math.max(span.endMs - span.startMs, rateFloorMs) / 60_000;
      const inSpan = strong.filter((h) => h.startMs >= span.startMs && h.endMs <= span.endMs);
      out.push({
        id: candidateId({
          detector: 'density',
          categories: [clause.category],
          startMs: span.startMs,
          endMs: span.endMs,
        }),
        detector: 'density',
        surface: 'audio',
        startMs: span.startMs,
        endMs: span.endMs,
        evidence: quoteAround(transcript, span.startMs, span.endMs, 0),
        evidenceType: 'transcript',
        categories: [clause.category],
        metrics: {
          strong_terms_in_span: inSpan.length,
          strong_terms_per_minute: Math.round((inSpan.length / spanMinutes) * 100) / 100,
          share_of_sentences_affected: Math.round(share * 100) / 100,
          threshold_terms_per_minute: perMinute,
          threshold_share: shareLimit,
          rate_measured_over_seconds: Math.round(Math.max(span.endMs - span.startMs, rateFloorMs) / 1000),
          span_seconds: Math.round((span.endMs - span.startMs) / 100) / 10,
          term_spans: inSpan.map((h) => `${h.startMs}-${h.endMs}`).join(' '),
        },
      });
    }
  }
  return sortCandidates(out);
}

export function densityClauses(pack: LoadedPack): Clause[] {
  return pack.pack.clauses.filter((c) => c.detector === 'density');
}
