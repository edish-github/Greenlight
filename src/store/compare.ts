/**
 * The naive-comparison document.
 *
 * Written only by scripts/make-naive-compare.ts against a live model. Read here
 * and rendered by components/NaiveCompare.tsx. It is committed to the repo and
 * static, so the /compare page makes zero API calls at demo time.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { samplesDir } from './paths';

export interface NaiveIssue {
  rule: string;
  severity: string;
  location: string;
  quote?: string;
}

export interface CompareDocument {
  status: 'placeholder' | 'captured';
  clipId: string;
  title: string;
  capturedAt: string | null;
  packVersion: string;
  naive: {
    model: string | null;
    systemPrompt: string;
    userPromptPreview: string;
    rawResponse: string | null;
    issues: NaiveIssue[];
    citesDeprecatedRule: boolean;
    deprecatedRuleMatches: string[];
  };
  greenlight: {
    clearedSpans: { startMs: number; endMs: number; evidence: string; why: string }[];
    findings: {
      clauseId: string;
      clauseTitle: string;
      effectiveDate: string;
      sourceUrl: string;
      severity: string;
      startMs: number;
      endMs: number;
      evidence: string;
      remediation: string;
    }[];
    dropped: { reason: string; count: number }[];
  };
  deprecatedRules: {
    id: string;
    title: string;
    removedOn: string;
    sourceUrl: string;
    evidence: string;
    whyPeopleStillBelieveIt: string;
  }[];
}

export function comparePath(): string {
  return path.join(samplesDir(), 'naive-compare.json');
}

export function readCompareDocument(): CompareDocument | null {
  try {
    return JSON.parse(readFileSync(comparePath(), 'utf8')) as CompareDocument;
  } catch {
    return null;
  }
}
