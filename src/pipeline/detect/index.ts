/**
 * Runs every candidate generator and merges the results.
 *
 * Plane 4 of the architecture: local, free, sub-100ms, high recall, and
 * deliberately low precision. Precision is the Gate's job. Nothing in this
 * directory is allowed to make a policy claim.
 */
import type { LoadedPack } from '../../policy/types';
import type { Candidate } from '../../types/finding';
import type { Transcript } from '../../types/transcript';
import { detectDensity } from './density';
import { detectFocus } from './focus';
import { detectLexicon, scanLexicon } from './lexicon';
import { detectPackaging, type PackagingInput } from './packaging';
import { sortCandidates } from './util';

export interface DetectInput extends PackagingInput {
  transcript: Transcript | null;
  pack: LoadedPack;
  /** Visual candidates from Day 4. Merged here so nothing downstream changes. */
  visualCandidates?: Candidate[];
}

export interface DetectResult {
  candidates: Candidate[];
  byDetector: Record<string, number>;
  obscuredCount: number;
  ms: number;
}

const MAX_CANDIDATES = 60;

export function detect(input: DetectInput): DetectResult {
  const started = Date.now();
  const { transcript, pack } = input;
  let candidates: Candidate[] = [];
  let obscuredCount = 0;

  if (transcript && transcript.words.length) {
    const scan = scanLexicon(transcript);
    obscuredCount = scan.obscuredCount;
    candidates = [
      ...detectLexicon(transcript, pack, scan),
      ...detectDensity(transcript, pack, scan),
      ...detectFocus(transcript, pack),
    ];
  }

  candidates.push(...detectPackaging(input, pack));
  if (input.visualCandidates?.length) candidates.push(...input.visualCandidates);

  // Dedupe by deterministic id, then cap. The cap is a cost guardrail: an
  // adversarial 60 minute file cannot turn into 400 adjudication calls.
  const seen = new Set<string>();
  const deduped = sortCandidates(candidates).filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  const capped = deduped.slice(0, MAX_CANDIDATES);
  const byDetector: Record<string, number> = {};
  for (const c of capped) byDetector[c.detector] = (byDetector[c.detector] ?? 0) + 1;

  return { candidates: capped, byDetector, obscuredCount, ms: Date.now() - started };
}
