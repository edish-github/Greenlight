/**
 * Lexicon access. Data lives in src/policy/lexicons/*.json; this module only
 * reads and indexes it.
 */
import { readFileSync } from 'node:fs';
import { lexiconPath } from '../store/paths';

export type Tier = 'strong' | 'moderate' | 'mild' | 'slur';

export interface TieredLexicon {
  language: string;
  version: string;
  tiers: Record<Tier, string[]>;
  slur_source: string | null;
  obscured_patterns: string[];
  abbreviation_allowlist: string[];
}

export interface TopicLexicon {
  version: string;
  categories: Record<string, string[]>;
}

let tiered: TieredLexicon | null = null;
let topics: TopicLexicon | null = null;
let termIndex: Map<string, Tier> | null = null;

export function loadTieredLexicon(): TieredLexicon {
  if (!tiered) {
    tiered = JSON.parse(readFileSync(lexiconPath('en-tiered.json'), 'utf8')) as TieredLexicon;
  }
  return tiered;
}

export function loadTopicLexicon(): TopicLexicon {
  if (!topics) {
    topics = JSON.parse(readFileSync(lexiconPath('topics.json'), 'utf8')) as TopicLexicon;
  }
  return topics;
}

/** term -> tier, built once. Strongest tier wins if a term appears twice. */
export function tierIndex(): Map<string, Tier> {
  if (termIndex) return termIndex;
  const lex = loadTieredLexicon();
  const order: Tier[] = ['mild', 'moderate', 'strong', 'slur'];
  const idx = new Map<string, Tier>();
  for (const tier of order) {
    for (const term of lex.tiers[tier] ?? []) idx.set(normalizeToken(term), tier);
  }
  termIndex = idx;
  return idx;
}

/**
 * Normalise a transcript token for matching: lowercase, strip surrounding
 * punctuation, collapse simple character substitutions. Deliberately shallow -
 * aggressive normalisation manufactures false positives, and the Gate cannot
 * un-see a candidate that should never have been generated.
 */
export function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^[^a-z0-9*#@$%]+|[^a-z0-9*#@$%]+$/g, '')
    .replace(/[0@]/g, 'o')
    .replace(/1|!/g, 'i')
    .replace(/\$/g, 's')
    .replace(/(.)\1{2,}/g, '$1$1');
}

let obscuredRe: RegExp[] | null = null;

export function isObscured(raw: string): boolean {
  if (!obscuredRe) {
    obscuredRe = loadTieredLexicon().obscured_patterns.map((p) => new RegExp(p, 'i'));
  }
  const t = raw.toLowerCase();
  return obscuredRe.some((r) => r.test(t));
}

export function isAllowlistedAbbreviation(token: string): boolean {
  return loadTieredLexicon().abbreviation_allowlist.includes(token.toLowerCase());
}

export function __resetLexiconsForTests(): void {
  tiered = null;
  topics = null;
  termIndex = null;
  obscuredRe = null;
}
