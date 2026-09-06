/**
 * Offline detection harness.
 *
 *   npm run detect -- evals/fixtures/clip-01.transcript.json --title "..." [--gate] [--mock-gate]
 *
 * Runs the policy pack and every deterministic detector against a transcript
 * fixture. No media, no ASR, no API key required. This is the loop to live in
 * while tuning thresholds, because it turns a 25-second scan into a 30ms one.
 */
import { readFileSync } from 'node:fs';
import { loadPack } from '../src/policy/loader';
import { detect } from '../src/pipeline/detect';
import { adjudicate } from '../src/pipeline/adjudicate/adjudicate';
import { scoreVerdict } from '../src/pipeline/score/verdict';
import type { Transcript } from '../src/types/transcript';
import { mockInvoker } from './lib/mock-invoker';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!file) {
  console.error('usage: npm run detect -- <transcript.json> [--title "..."] [--gate|--mock-gate]');
  process.exit(1);
}

function ts(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(
    Math.floor((ms % 1000) / 100),
  )}`;
}

async function main() {
  const pack = loadPack();
  const transcript = JSON.parse(readFileSync(file!, 'utf8')) as Transcript;
  const title = opt('title') ?? null;

  console.log(`\npack      ${pack.pack.pack.id}@${pack.version}`);
  console.log(`clauses   ${pack.allowlist.size} live, ${pack.pack.deprecated_rules.length} deprecated`);
  console.log(`deprecated in allowlist: ${[...pack.pack.deprecated_rules].filter((d) => pack.allowlist.has(d.id)).length} (must be 0)`);
  console.log(`transcript ${transcript.words.length} words, ${(transcript.durationMs / 1000).toFixed(1)}s`);
  if (title) console.log(`title     "${title}"`);

  const detected = detect({ transcript, pack, title });
  console.log(`\nCANDIDATES  ${detected.candidates.length} in ${detected.ms}ms  ${JSON.stringify(detected.byDetector)}`);
  console.log(`obscured occurrences skipped: ${detected.obscuredCount}\n`);

  for (const c of detected.candidates) {
    console.log(
      `  ${ts(c.startMs)}-${ts(c.endMs)}  ${c.detector.padEnd(9)} ${c.surface.padEnd(11)} ${c.categories.join(',')}`,
    );
    console.log(`      metrics  ${JSON.stringify(c.metrics)}`);
    console.log(`      evidence ${c.evidence.slice(0, 110)}${c.evidence.length > 110 ? '...' : ''}`);
  }

  if (!flag('gate') && !flag('mock-gate')) {
    console.log('\n(no --gate / --mock-gate: stopping before the Gate)\n');
    return;
  }

  const gate = await adjudicate({
    scanId: 'cli',
    candidates: detected.candidates,
    pack,
    transcript,
    durationMs: transcript.durationMs,
    dropsPath: null,
    invoke: flag('mock-gate') ? mockInvoker : undefined,
  });

  console.log(
    `\nGATE  ${gate.findings.length} findings | ${gate.clearedCandidates} cleared | ` +
      `${gate.drops.count} dropped ${JSON.stringify(gate.drops.byReason())}` +
      (flag('mock-gate') ? '  [MOCK ADJUDICATOR - deterministic stub, not a model]' : ''),
  );

  for (const f of gate.findings) {
    console.log(`\n  ${ts(f.startMs)}-${ts(f.endMs)}  ${f.severity.toUpperCase()}  ${f.clauseId} - ${f.clauseTitle}`);
    console.log(`      effective ${f.effectiveDate} | ${f.clauseTextStatus} | ${f.sourceUrl}`);
    console.log(`      fix ${f.remediation} | confidence ${f.confidence} | detector ${f.detector}`);
    console.log(`      ${f.rationale}`);
  }

  const verdict = scoreVerdict(gate.findings, { degradedCount: 1 });
  console.log(`\nVERDICT  ${verdict.headline}  confidence=${verdict.confidence}  ${JSON.stringify(verdict.counts)}`);
  console.log(`revenue at risk  ${verdict.revenueAtRisk.currency} ${verdict.revenueAtRisk.low}-${verdict.revenueAtRisk.high}`);
  console.log(`assumption  ${verdict.revenueAtRisk.assumption}`);
  console.log(`\n${verdict.disclaimer}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
