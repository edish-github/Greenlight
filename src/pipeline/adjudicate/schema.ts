import { z } from 'zod';

/**
 * The contract for model output.
 *
 * Parsed at the boundary with safeParse. Anything that fails is dropped and
 * counted, never coerced. Coercion is how a hallucinated span becomes a
 * confident red band on a timeline.
 */
export const FindingOut = z.object({
  clause_id: z.string(),
  surface: z.enum(['video_body', 'title', 'thumbnail', 'audio']),
  start_ms: z.number().int().nonnegative(),
  end_ms: z.number().int().nonnegative(),
  evidence: z.string().max(300),
  severity: z.enum(['no_ads', 'limited_ads', 'advisory']),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(400),
});

export const EmitFindings = z.object({
  findings: z.array(FindingOut).max(25),
});

export type FindingOutT = z.infer<typeof FindingOut>;

/** JSON Schema handed to the API. Kept beside the Zod contract so they drift together. */
export const EMIT_FINDINGS_TOOL = {
  name: 'emit_findings',
  description:
    'Emit zero or more policy findings for the candidate span. Emitting an empty array ' +
    'is a normal and frequent outcome and is preferred over a speculative match.',
  input_schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        maxItems: 25,
        items: {
          type: 'object',
          properties: {
            clause_id: {
              type: 'string',
              description: 'Must be one of the clause ids in the CLAUSES block. No other value is valid.',
            },
            surface: { type: 'string', enum: ['video_body', 'title', 'thumbnail', 'audio'] },
            start_ms: { type: 'integer', minimum: 0 },
            end_ms: { type: 'integer', minimum: 0 },
            evidence: { type: 'string', maxLength: 300 },
            severity: { type: 'string', enum: ['no_ads', 'limited_ads', 'advisory'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            rationale: { type: 'string', maxLength: 400 },
          },
          required: [
            'clause_id',
            'surface',
            'start_ms',
            'end_ms',
            'evidence',
            'severity',
            'confidence',
            'rationale',
          ],
        },
      },
    },
    required: ['findings'],
  } as Record<string, unknown>,
} as const;
