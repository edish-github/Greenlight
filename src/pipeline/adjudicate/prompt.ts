/**
 * Prompt construction.
 *
 * The adjudicator sees three things and nothing else: the candidate, the clause
 * text for that candidate's categories, and a bounded transcript window. It is
 * never handed the full policy corpus, it has no web access, and it is never
 * asked what it knows about YouTube policy.
 *
 * The closing rule in the system block is the one that matters. It is what
 * stops the model importing the deleted first-7-seconds rule out of its
 * training data.
 */
import type { Clause } from '../../policy/types';
import type { Candidate } from '../../types/finding';
import { textInRange, type Transcript } from '../../types/transcript';

export const SYSTEM_PROMPT = `You are a policy adjudicator. You will be given a candidate span detected by a deterministic detector, and the exact text of one or more policy clauses.

Decide whether the candidate matches a clause. Emit a finding ONLY if it does.

Rules:
- You may only cite clause IDs that appear in the CLAUSES block below. Any other id is invalid output.
- If no clause matches, return an empty findings array. This is a normal and frequent outcome, and it is strongly preferred over a speculative match.
- A single mention of a sensitive term is not a match for a density or focus clause. Those require sustained presence, and the detector's computed metrics tell you what was actually measured.
- Judge the span in front of you. Do not infer intent, and do not extrapolate to the rest of the video.
- Your start_ms and end_ms must stay inside the candidate span you were given.
- Do not reason from your own knowledge of platform policy. The CLAUSES block is the complete and current set of rules. Anything not in it does not exist.`;

export function renderClauses(clauses: Clause[]): string {
  return clauses
    .map((c) =>
      [
        `- id: ${c.id}`,
        `  title: ${c.title}`,
        `  severity: ${c.severity}`,
        `  surfaces: ${c.surfaces.join(', ')}`,
        `  effective_date: ${c.effective_date}`,
        `  thresholds: ${JSON.stringify(c.thresholds)}`,
        `  text: ${c.clause_text.trim().replace(/\s+/g, ' ')}`,
      ].join('\n'),
    )
    .join('\n\n');
}

function renderMetrics(metrics: Candidate['metrics']): string {
  const entries = Object.entries(metrics);
  if (!entries.length) return '  (none)';
  return entries.map(([k, v]) => `  ${k}: ${v}`).join('\n');
}

export const WINDOW_PAD_MS = 20_000;

export function buildUserPrompt(
  candidate: Candidate,
  clauses: Clause[],
  transcript: Transcript | null,
): string {
  const windowText = transcript
    ? textInRange(
        transcript,
        Math.max(0, candidate.startMs - WINDOW_PAD_MS),
        candidate.endMs + WINDOW_PAD_MS,
      )
    : '(no transcript available)';

  return `CLAUSES
${renderClauses(clauses)}

CANDIDATE
  candidate_id: ${candidate.id}
  detector: ${candidate.detector}
  surface: ${candidate.surface}
  span_ms: ${candidate.startMs}-${candidate.endMs}
  evidence: ${candidate.evidence}

COMPUTED METRICS (measured by the detector, not estimated)
${renderMetrics(candidate.metrics)}

TRANSCRIPT WINDOW (candidate span +/- ${WINDOW_PAD_MS / 1000}s)
${windowText || '(empty)'}`;
}
