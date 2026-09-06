/**
 * THE GATE
 *
 * The only path from a candidate to a finding. Three-stage rejection:
 *
 *   1. Zod schema     - malformed model output is dropped, never coerced.
 *   2. Allowlist      - a clause id outside the loaded pack cannot survive.
 *   3. Span sanity    - spans must be ordered, inside the video, and inside
 *                       the candidate they were adjudicating.
 *
 * Stage 2 is invariant I2 and it is the reason Greenlight structurally cannot
 * emit the deleted first-7-seconds rule. Even if the model insisted on it, the
 * id is not in the pack, so the finding is dropped and counted before it ever
 * reaches the UI.
 */
import { clausesForCategories } from '../../policy/loader';
import type { Clause, LoadedPack } from '../../policy/types';
import { logger } from '../../lib/logger';
import { liveInvoker, type ToolInvoker } from '../../lib/llm';
import type { Candidate, Finding, Severity } from '../../types/finding';
import type { Transcript } from '../../types/transcript';
import { DropLog } from './drops';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt';
import { EMIT_FINDINGS_TOOL, EmitFindings, type FindingOutT } from './schema';

const log = logger('gate');

/**
 * Which clauses this candidate is adjudicated against.
 *
 * Same category, same surface, and - where possible - the same detector. The
 * detector filter is what stops a repeated-profanity span being offered the
 * slur clause: the two are in one category but they are different questions,
 * and offering both invites the model to answer the wrong one. If no clause in
 * the category shares the detector, every clause in the category is offered
 * instead, so a new detector can never silently disable a clause.
 */
export function clausesForCandidate(pack: LoadedPack, candidate: Candidate): Clause[] {
  const inCategory = clausesForCategories(pack, candidate.categories).filter((c) =>
    c.surfaces.includes(candidate.surface),
  );
  const sameDetector = inCategory.filter((c) => c.detector === candidate.detector);
  return sameDetector.length ? sameDetector : inCategory;
}

export interface AdjudicateInput {
  scanId: string;
  candidates: Candidate[];
  pack: LoadedPack;
  transcript: Transcript | null;
  durationMs: number;
  dropsPath?: string | null;
  invoke?: ToolInvoker;
  /** Findings below this are dropped as noise. Raised if vision over-fires. */
  minConfidence?: number;
}

export interface AdjudicateResult {
  findings: Finding[];
  drops: DropLog;
  calls: number;
  usage: { input: number; output: number };
  ms: number;
  /** Candidates the Gate looked at and decided were not violations. */
  clearedCandidates: number;
}

function clauseSourceUrl(pack: LoadedPack, clause: Clause): string {
  return `${pack.sourceUrl}${clause.source_anchor}`;
}

/**
 * Severity and remediation come from the PACK, not from the model. The model
 * decides whether a clause matched; it does not get to decide how bad it is or
 * what we do about it. That keeps two of the three things on screen fully
 * deterministic.
 */
function toFinding(
  out: FindingOutT,
  clause: Clause,
  candidate: Candidate,
  pack: LoadedPack,
): Finding {
  return {
    id: `f_${candidate.id}_${clause.id}`,
    clauseId: clause.id,
    clauseTitle: clause.title,
    clauseText: clause.clause_text.trim(),
    clauseTextStatus: clause.text_status,
    effectiveDate: clause.effective_date,
    sourceUrl: clauseSourceUrl(pack, clause),
    surface: candidate.surface,
    startMs: out.start_ms,
    endMs: out.end_ms,
    evidence: out.evidence || candidate.evidence,
    evidenceType: candidate.evidenceType,
    severity: clause.severity as Severity,
    confidence: out.confidence,
    rationale: out.rationale,
    remediation: clause.remediation,
    detector: candidate.detector,
    candidateId: candidate.id,
    state: 'open',
  };
}

export async function adjudicate(input: AdjudicateInput): Promise<AdjudicateResult> {
  const started = Date.now();
  const invoke = input.invoke ?? liveInvoker;
  const minConfidence = input.minConfidence ?? 0.35;
  const drops = new DropLog(input.scanId, input.dropsPath ?? null);
  const findings: Finding[] = [];
  const usage = { input: 0, output: 0 };
  let calls = 0;
  let cleared = 0;

  for (const candidate of input.candidates) {
    const clauses = clausesForCandidate(input.pack, candidate);
    if (!clauses.length) {
      drops.add('wrong_surface', `no clause covers surface ${candidate.surface}`, candidate, candidate.id);
      continue;
    }

    let toolInput: unknown = null;
    try {
      const res = await invoke({
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(candidate, clauses, input.transcript),
        toolName: EMIT_FINDINGS_TOOL.name,
        toolDescription: EMIT_FINDINGS_TOOL.description,
        inputSchema: EMIT_FINDINGS_TOOL.input_schema,
      });
      calls++;
      usage.input += res.usage.input;
      usage.output += res.usage.output;
      toolInput = res.toolInput;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`provider error on ${candidate.id}: ${msg}`);
      drops.add('provider_error', msg, { candidate: candidate.id }, candidate.id);
      continue;
    }

    if (toolInput === null || toolInput === undefined) {
      drops.add('no_tool_call', 'model returned no tool call', { candidate: candidate.id }, candidate.id);
      continue;
    }

    // --- stage 1: schema ---------------------------------------------------
    const parsed = EmitFindings.safeParse(toolInput);
    if (!parsed.success) {
      drops.add('schema', parsed.error.issues.map((i) => i.message).join('; '), toolInput, candidate.id);
      continue;
    }

    if (parsed.data.findings.length === 0) {
      cleared++;
      continue;
    }

    for (const f of parsed.data.findings) {
      // --- stage 2: allowlist ---------------------------------------------
      if (!input.pack.allowlist.has(f.clause_id)) {
        drops.add('unknown_clause', `clause ${f.clause_id} is not in the loaded pack`, f, candidate.id);
        continue;
      }
      const clause = input.pack.registry.get(f.clause_id)!;

      // A clause the adjudicator was not shown is also a fabrication.
      if (!clauses.some((c) => c.id === clause.id)) {
        drops.add('unknown_clause', `clause ${f.clause_id} was not offered for this candidate`, f, candidate.id);
        continue;
      }

      // --- stage 3: span sanity -------------------------------------------
      if (f.end_ms <= f.start_ms && !(candidate.startMs === 0 && candidate.endMs === 0)) {
        drops.add('bad_span', `end_ms ${f.end_ms} <= start_ms ${f.start_ms}`, f, candidate.id);
        continue;
      }
      if (f.end_ms > input.durationMs + 1000) {
        drops.add('out_of_range', `end_ms ${f.end_ms} exceeds duration ${input.durationMs}`, f, candidate.id);
        continue;
      }
      if (!clause.surfaces.includes(f.surface)) {
        drops.add('wrong_surface', `clause ${clause.id} does not apply to ${f.surface}`, f, candidate.id);
        continue;
      }
      if (f.confidence < minConfidence) {
        drops.add('schema', `confidence ${f.confidence} below floor ${minConfidence}`, f, candidate.id);
        continue;
      }

      findings.push(toFinding(f, clause, candidate, input.pack));
    }
  }

  // Deterministic ordering, and one finding per (candidate, clause) pair.
  const seen = new Set<string>();
  const unique = findings
    .filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)))
    .sort((a, b) => a.startMs - b.startMs || a.clauseId.localeCompare(b.clauseId));

  log.info(
    `gate: ${input.candidates.length} candidates -> ${unique.length} findings, ` +
      `${cleared} cleared, ${drops.count} dropped ${JSON.stringify(drops.byReason())}`,
  );

  return {
    findings: unique,
    drops,
    calls,
    usage,
    ms: Date.now() - started,
    clearedCandidates: cleared,
  };
}
