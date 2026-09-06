/**
 * Defends invariants I1 and I2 at the data layer.
 *
 * The assertion that matters: no deprecated rule id can reach the allowlist.
 * That is what makes it structurally impossible for Greenlight to emit the
 * first-7-seconds rule that YouTube deleted in July 2025.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadPack, __clearPackCacheForTests } from '../src/policy/loader';
import { PolicyError } from '../src/policy/types';

const PACK = 'src/policy/packs/youtube-afg-2026.09.yaml';

function tmpPack(yaml: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'gl-pack-'));
  const p = path.join(dir, 'pack.yaml');
  writeFileSync(p, yaml, 'utf8');
  __clearPackCacheForTests();
  return p;
}

const MINIMAL = (extra: string) => `
pack:
  id: test
  version: "2026.09.01"
  source_url: https://example.com/guidelines
  update_log_url: https://example.com/log
  captured_at: "2026-09-04"
  captured_by: test
clauses:
  - id: AFG-LANG-002
    title: Profanity used repeatedly
    category: inappropriate_language
    surfaces: [audio]
    detector: density
    severity: limited_ads
    effective_date: "2025-07"
    remediation: bleep
    source_anchor: "#inappropriate-language"
    text_status: paraphrase
    verified_at: null
    thresholds: {}
    clause_text: >
      Profanity used repeatedly or throughout may not suit all advertisers.
${extra}
`;

describe('policy pack', () => {
  it('loads the shipped pack', () => {
    const pack = loadPack(PACK);
    expect(pack.allowlist.size).toBeGreaterThanOrEqual(12);
    expect(pack.version).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
  });

  it('never puts a deprecated rule id in the allowlist', () => {
    const pack = loadPack(PACK);
    expect(pack.pack.deprecated_rules.length).toBeGreaterThan(0);
    for (const dep of pack.pack.deprecated_rules) {
      expect(pack.allowlist.has(dep.id)).toBe(false);
      expect(pack.registry.get(dep.id)).toBeUndefined();
    }
  });

  it('specifically excludes the deleted first-7-seconds rule', () => {
    const pack = loadPack(PACK);
    const dep = pack.pack.deprecated_rules.find((d) => d.id === 'AFG-LANG-DEP-7SEC');
    expect(dep, 'AFG-LANG-DEP-7SEC must stay documented in the pack').toBeDefined();
    expect(dep!.removed_on).toBe('2025-07');
    expect(pack.allowlist.has('AFG-LANG-DEP-7SEC')).toBe(false);
    // and it must point at a live successor, not into the void
    for (const s of dep!.superseded_by) expect(pack.allowlist.has(s)).toBe(true);
  });

  it('gives every live clause an effective date, a source anchor and a text status', () => {
    const pack = loadPack(PACK);
    for (const c of pack.pack.clauses) {
      expect(c.effective_date, c.id).toMatch(/^\d{4}-\d{2}(-\d{2})?$/);
      expect(c.source_anchor, c.id).toMatch(/^#/);
      expect(['verbatim', 'paraphrase']).toContain(c.text_status);
      expect(c.clause_text.length, c.id).toBeGreaterThan(20);
    }
  });

  it('hard fails if a deprecated id is also a live clause', () => {
    const p = tmpPack(
      MINIMAL(`
deprecated_rules:
  - id: AFG-LANG-002
    title: Sneaky resurrection
    removed_on: "2025-07"
    superseded_by: []
    source_url: https://example.com/log
    evidence: Removed in July 2025 per the update log.
    why_people_still_believe_it: Every blog still repeats it.
`),
    );
    expect(() => loadPack(p)).toThrow(PolicyError);
  });

  it('hard fails if a deprecated rule points at a clause that does not exist', () => {
    const p = tmpPack(
      MINIMAL(`
deprecated_rules:
  - id: AFG-LANG-DEP-7SEC
    title: Strong profanity in the first 7 seconds
    removed_on: "2025-07"
    superseded_by: [AFG-DOES-NOT-EXIST]
    source_url: https://example.com/log
    evidence: Removed in July 2025 per the update log.
    why_people_still_believe_it: Every blog still repeats it.
`),
    );
    expect(() => loadPack(p)).toThrow(/superseded by/i);
  });

  it('rejects a malformed clause instead of loading a partial pack', () => {
    const p = tmpPack(`
pack:
  id: test
  version: "2026.09.01"
  source_url: https://example.com/guidelines
  update_log_url: https://example.com/log
  captured_at: "2026-09-04"
  captured_by: test
clauses:
  - id: NOT-A-CLAUSE-ID
    title: Bad
    category: inappropriate_language
    surfaces: [audio]
    detector: density
    severity: limited_ads
    effective_date: "2025-07"
    remediation: bleep
    source_anchor: "#x"
    text_status: paraphrase
    verified_at: null
    thresholds: {}
    clause_text: >
      Something long enough to pass the minimum length requirement here.
`);
    expect(() => loadPack(p)).toThrow(PolicyError);
  });
});
