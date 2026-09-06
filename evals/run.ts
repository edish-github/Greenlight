/**
 * The eval harness.
 *
 *   npm run eval                 # adjudicated findings, needs ANTHROPIC_API_KEY
 *   npm run eval -- --candidates # detector stage only, no key, no network
 *   npm run eval -- --mock-gate  # deterministic stub adjudicator, for plumbing
 *   npm run eval -- --write      # also writes evals/RESULTS.md
 *
 * WHAT THIS MEASURES, precisely: detection recall against hand-labelled spans.
 * NOT prediction accuracy against YouTube's decisions. Monetization status is
 * private to the channel owner, so nobody outside YouTube can honestly measure
 * the second thing, and any project claiming to has measured something else.
 *
 * Stating that in one sentence is what makes every other number here credible.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hasKey } from '../src/lib/env';
import { loadPack } from '../src/policy/loader';
import { detect } from '../src/pipeline/detect';
import { adjudicate } from '../src/pipeline/adjudicate/adjudicate';
import { fixturesDir } from '../src/store/paths';
import type { Candidate, Finding } from '../src/types/finding';
import type { Transcript } from '../src/types/transcript';
import { mockInvoker } from '../scripts/lib/mock-invoker';

/** Overlap slack. A span the detector starts 800ms early is still the same span. */
const TOLERANCE_MS = 2000;

interface LabelSpan {
  id: string;
  startMs: number;
  endMs: number;
  surface?: string;
  clauseId: string;
  category: string;
  note?: string;
}

interface NegativeSpan {
  id: string;
  startMs: number;
  endMs: number;
  category: string;
  note?: string;
}

interface LabelFile {
  clipId: string;
  label: string;
  transcript: string;
  title?: string;
  durationMs: number;
  spans: LabelSpan[];
  negatives?: NegativeSpan[];
}

type Mode = 'adjudicated' | 'candidates' | 'mock';

interface Predicted {
  key: string;
  clauseId: string;
  category: string;
  startMs: number;
  endMs: number;
}

interface ClipResult {
  clipId: string;
  label: string;
  mode: Mode;
  truePositives: { label: LabelSpan; predicted: Predicted }[];
  falseNegatives: LabelSpan[];
  falsePositives: Predicted[];
  /** False positives that land inside an explicitly labelled negative span. */
  folkloreHits: { negative: NegativeSpan; predicted: Predicted }[];
  drops: Record<string, number>;
  cleared: number;
  candidateCount: number;
}

function overlaps(a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }): boolean {
  // Packaging spans are zero-width at t=0 and match on clause alone.
  if (a.endMs === 0 && b.endMs === 0) return true;
  return a.startMs - TOLERANCE_MS <= b.endMs && b.startMs - TOLERANCE_MS <= a.endMs;
}

/**
 * Negative spans get NO tolerance.
 *
 * Slack exists so a detector that starts a span 800ms early still counts as
 * having found it. Applying that same slack to a "must not fire here" span
 * manufactures failures: a density span ending at 61.9s was being counted as
 * firing inside a negative that starts at 62.5s. Positives are scored
 * generously, negatives strictly.
 */
function strictlyOverlaps(
  a: { startMs: number; endMs: number },
  b: { startMs: number; endMs: number },
): boolean {
  if (a.endMs === 0 || b.endMs === 0) return false;
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

function categoryOf(clauseId: string): string {
  const map: Record<string, string> = {
    'AFG-LANG': 'inappropriate_language',
    'AFG-PKG': 'packaging',
    'AFG-VIOL': 'violence',
    'AFG-SENS': 'sensitive_events',
    'AFG-ADULT': 'adult_content',
    'AFG-DRUG': 'recreational_drugs',
    'AFG-HARM': 'harmful_acts',
    'AFG-CONTRO': 'controversial_issues',
    'AFG-FIRE': 'firearms',
    'AFG-SHOCK': 'shocking_content',
  };
  return map[clauseId.split('-').slice(0, 2).join('-')] ?? 'unknown';
}

/**
 * In candidate mode a prediction has no clause id, because the detector never
 * assigns one - that is the Gate's job. So the label's clause is credited when
 * the candidate's CATEGORY matches. Scored separately and labelled as such,
 * because it is a strictly easier task than the adjudicated one.
 */
function candidateToPredicted(c: Candidate): Predicted {
  return {
    key: c.id,
    clauseId: `(candidate:${c.detector})`,
    category: c.categories[0] === 'inappropriate_language' && c.surface === 'title'
      ? 'packaging'
      : (c.categories[0] ?? 'unknown'),
    startMs: c.startMs,
    endMs: c.endMs,
  };
}

function findingToPredicted(f: Finding): Predicted {
  return {
    key: f.id,
    clauseId: f.clauseId,
    category: categoryOf(f.clauseId),
    startMs: f.startMs,
    endMs: f.endMs,
  };
}

function labelCategory(label: LabelSpan): string {
  return label.surface === 'title' || label.surface === 'thumbnail'
    ? 'packaging'
    : label.category;
}

async function evaluateClip(file: string, mode: Mode): Promise<ClipResult> {
  const labels = JSON.parse(readFileSync(file, 'utf8')) as LabelFile;
  const transcript = JSON.parse(
    readFileSync(path.join(fixturesDir(), labels.transcript), 'utf8'),
  ) as Transcript;
  const pack = loadPack();

  const detected = detect({ transcript, pack, title: labels.title ?? null });

  let predictions: Predicted[];
  let drops: Record<string, number> = {};
  let cleared = 0;

  if (mode === 'candidates') {
    predictions = detected.candidates.map(candidateToPredicted);
  } else {
    const gate = await adjudicate({
      scanId: `eval-${labels.clipId}`,
      candidates: detected.candidates,
      pack,
      transcript,
      durationMs: labels.durationMs,
      dropsPath: null,
      invoke: mode === 'mock' ? mockInvoker : undefined,
    });
    predictions = gate.findings.map(findingToPredicted);
    drops = gate.drops.byReason();
    cleared = gate.clearedCandidates;
  }

  const matchedPredictions = new Set<string>();
  const truePositives: ClipResult['truePositives'] = [];
  const falseNegatives: LabelSpan[] = [];

  for (const label of labels.spans) {
    const hit = predictions.find((p) => {
      if (matchedPredictions.has(p.key)) return false;
      const sameThing =
        mode === 'candidates'
          ? p.category === labelCategory(label)
          : p.clauseId === label.clauseId;
      return sameThing && overlaps(p, label);
    });

    if (hit) {
      matchedPredictions.add(hit.key);
      truePositives.push({ label, predicted: hit });
    } else {
      falseNegatives.push(label);
    }
  }

  const falsePositives = predictions.filter((p) => !matchedPredictions.has(p.key));

  const folkloreHits: ClipResult['folkloreHits'] = [];
  for (const negative of labels.negatives ?? []) {
    for (const p of falsePositives) {
      if (strictlyOverlaps(p, negative)) folkloreHits.push({ negative, predicted: p });
    }
  }

  return {
    clipId: labels.clipId,
    label: labels.label,
    mode,
    truePositives,
    falseNegatives,
    falsePositives,
    folkloreHits,
    drops,
    cleared,
    candidateCount: detected.candidates.length,
  };
}

function pct(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '—';
}

function buildReport(results: ClipResult[], mode: Mode): string {
  const pack = loadPack();
  const tp = results.reduce((n, r) => n + r.truePositives.length, 0);
  const fn = results.reduce((n, r) => n + r.falseNegatives.length, 0);
  const fp = results.reduce((n, r) => n + r.falsePositives.length, 0);
  const folklore = results.reduce((n, r) => n + r.folkloreHits.length, 0);
  const labelled = tp + fn;

  const recall = labelled ? tp / labelled : NaN;
  const precision = tp + fp ? tp / (tp + fp) : NaN;
  const fpPerClip = results.length ? fp / results.length : NaN;

  // per-category breakdown
  const categories = new Map<string, { tp: number; fn: number; fp: number }>();
  const bump = (cat: string, key: 'tp' | 'fn' | 'fp') => {
    const row = categories.get(cat) ?? { tp: 0, fn: 0, fp: 0 };
    row[key]++;
    categories.set(cat, row);
  };
  for (const r of results) {
    for (const t of r.truePositives) bump(labelCategory(t.label), 'tp');
    for (const f of r.falseNegatives) bump(labelCategory(f), 'fn');
    for (const f of r.falsePositives) bump(f.category, 'fp');
  }

  const allDrops: Record<string, number> = {};
  for (const r of results) {
    for (const [reason, count] of Object.entries(r.drops)) {
      allDrops[reason] = (allDrops[reason] ?? 0) + count;
    }
  }
  const dropTotal = Object.values(allDrops).reduce((a, b) => a + b, 0);

  const modeNote =
    mode === 'adjudicated'
      ? 'Findings after the Gate, using the live adjudicator.'
      : mode === 'candidates'
        ? 'DETECTOR STAGE ONLY. Candidates are scored by category, before any clause is assigned. Plane 4 is built for high recall and deliberately low precision, so the precision figure here is expected to be poor and is not comparable to the adjudicated run.'
        : 'MOCK ADJUDICATOR. A deterministic stub stands in for the model, so these numbers measure the plumbing, not the reasoning. Not a real result.';

  const lines: string[] = [];
  lines.push(`# Eval results`);
  lines.push('');
  lines.push(`Pack \`${pack.pack.pack.id}@${pack.version}\` · ${results.length} clip${results.length === 1 ? '' : 's'} · ${labelled} labelled spans · run ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push(`**Mode:** ${modeNote}`);
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push(
    'These numbers measure **detection recall against hand-labelled spans, not prediction ' +
      "accuracy against YouTube's private monetization decisions.** Monetization status is " +
      'visible only to the channel owner, so no third party can honestly measure the second ' +
      'thing. Anyone publishing a "demonetization accuracy" figure has measured something else.',
  );
  lines.push('');
  lines.push('## Overall');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  lines.push(`| Recall | ${pct(recall)} |`);
  lines.push(`| Precision | ${pct(precision)} |`);
  lines.push(`| False positives per clip | ${pct(fpPerClip)} |`);
  lines.push(`| Labelled spans | ${labelled} |`);
  lines.push(`| Found / missed | ${tp} / ${fn} |`);
  lines.push(`| Hits on labelled negatives | ${folklore} |`);
  lines.push('');
  lines.push('## By category');
  lines.push('');
  lines.push('| Category | Recall | Precision | TP | FN | FP |');
  lines.push('|---|---|---|---|---|---|');
  for (const [cat, row] of [...categories.entries()].sort()) {
    const r = row.tp + row.fn ? row.tp / (row.tp + row.fn) : NaN;
    const p = row.tp + row.fp ? row.tp / (row.tp + row.fp) : NaN;
    lines.push(`| ${cat} | ${pct(r)} | ${pct(p)} | ${row.tp} | ${row.fn} | ${row.fp} |`);
  }
  lines.push('');
  lines.push('## Labelled negatives');
  lines.push('');
  lines.push(
    'Spans that must **not** fire. A checker that flags everything scores perfect recall and is ' +
      'useless, so these are scored explicitly.',
  );
  lines.push('');
  if (mode === 'candidates') {
    lines.push(
      'Not enforced in this mode. Detectors are *supposed* to raise candidates inside these ' +
        'spans — the isolated strong word at 0:01 is exactly the thing that must be detected and ' +
        'then cleared. The check only means something once the Gate has run.',
    );
    lines.push('');
  }
  if (folklore === 0) {
    lines.push('No predictions landed on a labelled negative span.');
  } else {
    lines.push('| Negative | Fired anyway | Note |');
    lines.push('|---|---|---|');
    for (const r of results) {
      for (const h of r.folkloreHits) {
        lines.push(`| ${h.negative.id} | ${h.predicted.clauseId} | ${h.negative.note ?? ''} |`);
      }
    }
  }
  lines.push('');
  if (mode !== 'candidates') {
    lines.push('## Dropped by the Gate');
    lines.push('');
    lines.push(
      `${dropTotal} model outputs were rejected before reaching a report` +
        (dropTotal
          ? `: ${Object.entries(allDrops)
              .map(([reason, count]) => `${reason} ${count}`)
              .join(' · ')}.`
          : '.'),
    );
    lines.push('');
    lines.push(
      `${results.reduce((n, r) => n + r.cleared, 0)} candidate spans were adjudicated and cleared ` +
        '— detected, checked against the clause text, and found not to match anything in the ' +
        'current pack.',
    );
    lines.push('');
  }
  lines.push('## Per clip');
  lines.push('');
  for (const r of results) {
    lines.push(`### ${r.clipId} — ${r.label}`);
    lines.push('');
    lines.push(
      `${r.candidateCount} candidates · ${r.truePositives.length} found · ` +
        `${r.falseNegatives.length} missed · ${r.falsePositives.length} false positives`,
    );
    if (r.falseNegatives.length) {
      lines.push('');
      lines.push('Missed:');
      for (const m of r.falseNegatives) {
        lines.push(`- \`${m.id}\` ${m.clauseId} at ${(m.startMs / 1000).toFixed(1)}s — ${m.note ?? ''}`);
      }
    }
    lines.push('');
  }
  lines.push('## Reproducing');
  lines.push('');
  lines.push('```bash');
  lines.push('npm run eval                 # adjudicated, needs ANTHROPIC_API_KEY');
  lines.push('npm run eval -- --candidates # detector stage only, no key required');
  lines.push('```');
  lines.push('');
  lines.push(
    'Ground truth lives in `evals/fixtures/*.labels.json` and is hand-written. Overlap tolerance ' +
      `is ${TOLERANCE_MS}ms.`,
  );
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const mode: Mode = args.includes('--candidates')
    ? 'candidates'
    : args.includes('--mock-gate')
      ? 'mock'
      : 'adjudicated';

  if (mode === 'adjudicated' && !hasKey('ANTHROPIC_API_KEY')) {
    console.error(
      'No ANTHROPIC_API_KEY, so the Gate cannot run and there are no findings to score.\n' +
        'Either set the key, or run one of:\n' +
        '  npm run eval -- --candidates   detector stage only, honest and offline\n' +
        '  npm run eval -- --mock-gate    plumbing check with a deterministic stub',
    );
    process.exit(1);
  }

  const files = readdirSync(fixturesDir())
    .filter((f) => f.endsWith('.labels.json'))
    .map((f) => path.join(fixturesDir(), f))
    .sort();

  if (!files.length) {
    console.error(`No *.labels.json in ${fixturesDir()}. Label some spans first.`);
    process.exit(1);
  }

  const results: ClipResult[] = [];
  for (const file of files) {
    results.push(await evaluateClip(file, mode));
  }

  const report = buildReport(results, mode);
  console.log(`\n${report}`);

  if (write) {
    const out = path.join(process.cwd(), 'evals', 'RESULTS.md');
    writeFileSync(out, report, 'utf8');
    console.log(`\nwrote ${out}`);
  }

  const missed = results.reduce((n, r) => n + r.falseNegatives.length, 0);
  const folklore = results.reduce((n, r) => n + r.folkloreHits.length, 0);
  // A hit on a labelled negative is a hard failure. Missing a span is a quality
  // problem; firing on a span we have explicitly said is fine is the failure
  // mode this whole product exists to avoid.
  if (folklore > 0 && mode === 'adjudicated') {
    console.error(
      `\nFAIL: ${folklore} finding(s) landed on a labelled negative span. ` +
        'This is the failure mode the product exists to avoid, so it exits non-zero.',
    );
    process.exit(1);
  }
  if (folklore > 0) {
    console.log(
      `\n${folklore} prediction(s) fell inside a labelled negative span. Expected before the ` +
        'Gate runs; only a failure in adjudicated mode.',
    );
  }
  if (missed > 0) {
    console.log(`\n${missed} labelled span(s) missed. Not a failure, but look at them.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
