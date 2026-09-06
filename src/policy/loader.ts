/**
 * Pack loading and the allowlist guardrail.
 *
 * INVARIANT I2: a finding cannot exist without a clause ID present in the
 * loaded pack's allowlist.
 *
 * The allowlist is built here, at load time, from the live clause list only.
 * Deprecated IDs are checked against it and the load HARD FAILS if one has
 * leaked in. That is the specific mechanism that makes it structurally
 * impossible for Greenlight to emit the deleted first-7-seconds rule, no matter
 * what the model believes it knows.
 */
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { PackSchema, PolicyError, type Clause, type LoadedPack } from './types';

// Re-exported so pipeline modules import policy types from one place.
export type { Clause, LoadedPack } from './types';
import { packPath } from '../store/paths';
import { logger } from '../lib/logger';

const log = logger('policy');

const cache = new Map<string, LoadedPack>();

export function loadPack(path: string = packPath()): LoadedPack {
  const hit = cache.get(path);
  if (hit) return hit;

  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new PolicyError(
      `Could not read the policy pack at ${path}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const parsed = PackSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new PolicyError(`Policy pack failed validation (${path}):\n${detail}`);
  }
  const pack = parsed.data;

  // Duplicate ids would make the registry silently lossy.
  const seen = new Set<string>();
  for (const c of pack.clauses) {
    if (seen.has(c.id)) throw new PolicyError(`Duplicate clause id ${c.id} in ${path}`);
    seen.add(c.id);
  }

  const registry = new Map<string, Clause>(pack.clauses.map((c) => [c.id, c]));
  const allowlist = new Set<string>(registry.keys());

  // --- the guardrail -------------------------------------------------------
  for (const dep of pack.deprecated_rules) {
    if (allowlist.has(dep.id)) {
      throw new PolicyError(
        `Deprecated clause ${dep.id} ("${dep.title}", removed ${dep.removed_on}) is live in the pack. ` +
          `Remove it from clauses: or remove it from deprecated_rules:. It cannot be both.`,
      );
    }
    for (const s of dep.superseded_by) {
      if (!allowlist.has(s)) {
        throw new PolicyError(
          `Deprecated rule ${dep.id} says it is superseded by ${s}, which is not a live clause.`,
        );
      }
    }
  }

  const byCategory = new Map<string, Clause[]>();
  for (const c of pack.clauses) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }

  const loaded: LoadedPack = Object.freeze({
    pack,
    registry,
    allowlist,
    byCategory,
    version: pack.pack.version,
    sourceUrl: pack.pack.source_url,
    path,
  });

  log.info(
    `pack ${pack.pack.id}@${pack.pack.version} loaded: ` +
      `${allowlist.size} live clauses, ${pack.deprecated_rules.length} deprecated`,
  );
  cache.set(path, loaded);
  return loaded;
}

export function clauseUrl(pack: LoadedPack, clauseId: string): string {
  const clause = pack.registry.get(clauseId);
  return clause ? `${pack.sourceUrl}${clause.source_anchor}` : pack.sourceUrl;
}

export function clausesForCategories(pack: LoadedPack, categories: string[]): Clause[] {
  const out: Clause[] = [];
  const seen = new Set<string>();
  for (const cat of categories) {
    for (const c of pack.byCategory.get(cat) ?? []) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        out.push(c);
      }
    }
  }
  return out;
}

export function clausesForDetector(pack: LoadedPack, detector: string): Clause[] {
  return pack.pack.clauses.filter((c) => c.detector === detector);
}

/** Numeric threshold with a default. Detectors read thresholds from the pack, never from code. */
export function threshold(clause: Clause, key: string, fallback: number): number {
  const v = clause.thresholds[key];
  return typeof v === 'number' ? v : fallback;
}

export function tierList(clause: Clause, key = 'tiers'): string[] {
  const v = clause.thresholds[key];
  return Array.isArray(v) ? v : [];
}

export function __clearPackCacheForTests(): void {
  cache.clear();
}
