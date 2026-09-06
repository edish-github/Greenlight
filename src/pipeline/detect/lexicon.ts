/**
 * Lexicon detector: individual profanity and slur occurrences in the body.
 *
 * IMPORTANT - this detector raises a CANDIDATE, not a violation.
 *
 * Under the current guidelines a single strong profanity in the video body is
 * ad-eligible. Flagging it as a violation is exactly the folklore this product
 * exists to kill. So the occurrence is surfaced, handed to the Gate with the
 * clause text, and the Gate returns no finding for isolated use. That outcome
 * is normal, it is counted, and the count is shown during the scan.
 *
 * Occurrences that are already obscured (bleeped, masked, "f***") are recorded
 * and NOT raised at all: YouTube places obscured profanity in the tier that can
 * earn ad revenue.
 */
import type { LoadedPack } from '../../policy/types';
import { isAllowlistedAbbreviation, isObscured, normalizeToken, tierIndex } from '../../policy/lexicon';
import type { Candidate } from '../../types/finding';
import type { Transcript } from '../../types/transcript';
import { candidateId, quoteAround, sortCandidates } from './util';

export interface LexiconHit {
  term: string;
  tier: string;
  startMs: number;
  endMs: number;
  wordIndex: number;
}

export interface LexiconScan {
  hits: LexiconHit[];
  obscuredCount: number;
  byTier: Record<string, number>;
}

/** Raw scan of the transcript. Shared by the lexicon and density detectors. */
export function scanLexicon(transcript: Transcript): LexiconScan {
  const index = tierIndex();
  const hits: LexiconHit[] = [];
  const byTier: Record<string, number> = { strong: 0, moderate: 0, mild: 0, slur: 0 };
  let obscuredCount = 0;

  transcript.words.forEach((w, i) => {
    if (isObscured(w.text)) {
      obscuredCount++;
      return;
    }
    const token = normalizeToken(w.text);
    if (!token || isAllowlistedAbbreviation(token)) return;
    const tier = index.get(token);
    if (!tier) return;
    hits.push({ term: token, tier, startMs: w.startMs, endMs: w.endMs, wordIndex: i });
    byTier[tier] = (byTier[tier] ?? 0) + 1;
  });

  return { hits, obscuredCount, byTier };
}

const MERGE_GAP_MS = 6000;
const PAD_MS = 250;

export function detectLexicon(
  transcript: Transcript,
  pack: LoadedPack,
  scan: LexiconScan = scanLexicon(transcript),
): Candidate[] {
  const clauses = pack.pack.clauses.filter(
    (c) => c.detector === 'lexicon' && c.surfaces.some((s) => s === 'video_body' || s === 'audio'),
  );
  if (!clauses.length) return [];

  const categories = [...new Set(clauses.map((c) => c.category))];

  // Only tiers that some lexicon or density clause could plausibly care about.
  const relevant = scan.hits.filter((h) => h.tier === 'strong' || h.tier === 'slur');
  if (!relevant.length) return [];

  const groups: LexiconHit[][] = [];
  for (const hit of relevant) {
    const last = groups[groups.length - 1];
    if (last && hit.startMs - last[last.length - 1].endMs <= MERGE_GAP_MS) last.push(hit);
    else groups.push([hit]);
  }

  return sortCandidates(
    groups.map((group) => {
      const startMs = Math.max(0, group[0].startMs - PAD_MS);
      const endMs = group[group.length - 1].endMs + PAD_MS;
      const tiers = [...new Set(group.map((h) => h.tier))];
      return {
        id: candidateId({ detector: 'lexicon', categories, startMs, endMs }),
        detector: 'lexicon' as const,
        surface: 'audio' as const,
        startMs,
        endMs,
        evidence: quoteAround(transcript, startMs, endMs),
        evidenceType: 'transcript' as const,
        categories,
        metrics: {
          occurrences: group.length,
          tiers: tiers.join(','),
          highest_tier: tiers.includes('slur') ? 'slur' : 'strong',
          obscured_elsewhere: scan.obscuredCount,
          spans: group.map((h) => `${h.startMs}-${h.endMs}`).join(' '),
        },
      };
    }),
  );
}
