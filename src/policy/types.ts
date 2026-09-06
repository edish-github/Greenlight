import { z } from 'zod';

export const SurfaceEnum = z.enum(['video_body', 'title', 'thumbnail', 'audio']);
export const SeverityEnum = z.enum(['no_ads', 'limited_ads', 'advisory']);
export const DetectorEnum = z.enum(['lexicon', 'density', 'focus', 'visual', 'packaging']);
export const RemediationEnum = z.enum([
  'mute',
  'bleep',
  'trim',
  'blur_region',
  'packaging_edit',
  'manual_review',
]);

/** YYYY-MM or YYYY-MM-DD. Every clause must carry one; the UI renders it. */
const EffectiveDate = z
  .string()
  .regex(/^\d{4}-\d{2}(-\d{2})?$/, 'effective_date must be YYYY-MM or YYYY-MM-DD');

export const ClauseSchema = z
  .object({
    id: z.string().regex(/^AFG-[A-Z]+-\d{3}$/, 'clause id must look like AFG-LANG-002'),
    title: z.string().min(3),
    category: z.string().min(3),
    surfaces: z.array(SurfaceEnum).min(1),
    detector: DetectorEnum,
    severity: SeverityEnum,
    effective_date: EffectiveDate,
    remediation: RemediationEnum,
    source_anchor: z.string().startsWith('#'),
    text_status: z.enum(['verbatim', 'paraphrase']),
    verified_at: z.string().nullable().default(null),
    thresholds: z.record(z.union([z.number(), z.string(), z.array(z.string())])).default({}),
    clause_text: z.string().min(20),
  })
  .strict();

export const DeprecatedRuleSchema = z
  .object({
    id: z.string().min(3),
    title: z.string().min(3),
    removed_on: EffectiveDate,
    superseded_by: z.array(z.string()).default([]),
    source_url: z.string().url(),
    evidence: z.string().min(10),
    why_people_still_believe_it: z.string().min(10),
  })
  .strict();

export const PackSchema = z
  .object({
    pack: z
      .object({
        id: z.string().min(2),
        version: z.string().regex(/^\d{4}\.\d{2}\.\d{2}$/, 'version must be YYYY.MM.NN'),
        source_url: z.string().url(),
        update_log_url: z.string().url(),
        captured_at: z.string(),
        captured_by: z.string(),
        note: z.string().optional(),
      })
      .strict(),
    clauses: z.array(ClauseSchema).min(1),
    deprecated_rules: z.array(DeprecatedRuleSchema).default([]),
  })
  .strict();

export type Clause = z.infer<typeof ClauseSchema>;
export type DeprecatedRule = z.infer<typeof DeprecatedRuleSchema>;
export type Pack = z.infer<typeof PackSchema>;

export interface LoadedPack {
  pack: Pack;
  registry: ReadonlyMap<string, Clause>;
  /** The single source of truth for what a finding is allowed to cite. */
  allowlist: ReadonlySet<string>;
  byCategory: ReadonlyMap<string, Clause[]>;
  version: string;
  sourceUrl: string;
  path: string;
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyError';
  }
}
