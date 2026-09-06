export type Surface = 'video_body' | 'title' | 'thumbnail' | 'audio';
export type Severity = 'no_ads' | 'limited_ads' | 'advisory';
export type Remediation =
  | 'mute'
  | 'bleep'
  | 'trim'
  | 'blur_region'
  | 'packaging_edit'
  | 'manual_review';

export type FindingState = 'open' | 'dismissed' | 'planned' | 'resolved' | 'persisted';

export type DetectorName = 'lexicon' | 'density' | 'focus' | 'visual' | 'packaging';

export interface Candidate {
  id: string;
  detector: DetectorName;
  surface: Surface;
  startMs: number;
  endMs: number;
  /** Transcript quote, OCR text or keyframe descriptor. Never a policy opinion. */
  evidence: string;
  evidenceType: 'transcript' | 'keyframe' | 'packaging';
  /** Policy categories whose clause text should be shown to the adjudicator. */
  categories: string[];
  /** Numbers the detector computed. Passed to the model as facts, not judgements. */
  metrics: Record<string, number | string>;
}

export interface Finding {
  id: string;
  clauseId: string; // guaranteed to be in the loaded pack's allowlist
  clauseTitle: string;
  clauseText: string;
  clauseTextStatus: 'verbatim' | 'paraphrase';
  effectiveDate: string; // shown in the UI - this is the trust signal
  sourceUrl: string; // deep link to the live help centre page
  surface: Surface;
  startMs: number;
  endMs: number;
  evidence: string;
  evidenceType: 'transcript' | 'keyframe' | 'packaging';
  keyframePath?: string;
  severity: Severity;
  confidence: number;
  rationale: string;
  remediation: Remediation;
  detector: DetectorName;
  candidateId: string;
  state: FindingState;
}

export type DropReason =
  | 'schema'
  | 'unknown_clause'
  | 'bad_span'
  | 'out_of_range'
  | 'wrong_surface'
  | 'no_tool_call'
  | 'provider_error';

export interface Drop {
  at: string;
  scanId: string;
  reason: DropReason;
  candidateId?: string;
  detail: string;
  payload: unknown;
}

export const SEVERITY_RANK: Record<Severity, number> = {
  no_ads: 3,
  limited_ads: 2,
  advisory: 1,
};
