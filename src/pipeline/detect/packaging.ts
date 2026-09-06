/**
 * Packaging detector: title and thumbnail text.
 *
 * A separate surface because YouTube scores it separately, and because this is
 * one of the two rules that survived the July 2025 relaxation: profanity in the
 * title or thumbnail is excluded from ad inventory at every advertiser setting.
 * A creator who cleans up the body and leaves the title dirty has fixed nothing.
 *
 * Thumbnail OCR arrives on Day 4. Passing `thumbnailText` here is all the
 * integration that will require.
 */
import type { LoadedPack } from '../../policy/types';
import { isObscured, normalizeToken, tierIndex } from '../../policy/lexicon';
import { tierList } from '../../policy/loader';
import type { Candidate } from '../../types/finding';
import { candidateId, sortCandidates } from './util';

export interface PackagingInput {
  title?: string | null;
  thumbnailText?: string | null;
}

export function detectPackaging(input: PackagingInput, pack: LoadedPack): Candidate[] {
  const clauses = pack.pack.clauses.filter((c) => c.detector === 'packaging');
  if (!clauses.length) return [];

  const index = tierIndex();
  const out: Candidate[] = [];

  const surfaces: { surface: 'title' | 'thumbnail'; text: string | null | undefined }[] = [
    { surface: 'title', text: input.title },
    { surface: 'thumbnail', text: input.thumbnailText },
  ];

  for (const { surface, text } of surfaces) {
    if (!text || !text.trim()) continue;

    const applicable = clauses.filter((c) => c.surfaces.includes(surface));
    if (!applicable.length) continue;
    const wanted = new Set(applicable.flatMap((c) => tierList(c)));

    const tokens = text.split(/\s+/);
    const hits: { token: string; tier: string }[] = [];
    let obscured = 0;

    for (const token of tokens) {
      if (isObscured(token)) {
        obscured++;
        continue;
      }
      const t = normalizeToken(token);
      const tier = t ? index.get(t) : undefined;
      if (tier && (wanted.size === 0 || wanted.has(tier))) hits.push({ token: t, tier });
    }
    if (!hits.length) continue;

    const categories = [...new Set(applicable.map((c) => c.category))];
    out.push({
      id: candidateId({ detector: 'packaging', categories: [surface, ...categories], startMs: 0, endMs: 0 }),
      detector: 'packaging',
      surface,
      // Packaging has no timeline position. Zero-width span at t=0; the UI
      // renders these as a separate pinned row rather than a timeline band.
      startMs: 0,
      endMs: 0,
      evidence: text.trim().slice(0, 280),
      evidenceType: 'packaging',
      categories,
      metrics: {
        surface,
        occurrences: hits.length,
        tiers: [...new Set(hits.map((h) => h.tier))].join(','),
        obscured_terms: obscured,
        matched: hits.map((h) => h.token).join(', '),
      },
    });
  }
  return sortCandidates(out);
}
