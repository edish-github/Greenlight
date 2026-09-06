/**
 * Captures the naive-LLM comparison.
 *
 *   npm run compare:capture            # capture against the live model
 *   npm run compare:capture -- --dry   # show the exact prompts, call nothing
 *
 * The left-hand side of the comparison panel is a REAL model response to a
 * deliberately naive prompt: transcript in, "find policy violations" out, no
 * policy data supplied. The right-hand side is Greenlight's actual output on
 * the same clip.
 *
 * Two rules govern this file, and both exist because the panel's whole value is
 * that a skeptical judge can trust it:
 *
 *   1. Nothing here writes a model response by hand. If the capture has not
 *      been run, the committed JSON carries `status: "placeholder"` and the UI
 *      says so in the panel itself rather than presenting invented output as
 *      evidence.
 *   2. The raw response text and the exact prompt are both stored, so anyone
 *      can re-run it and check.
 *
 * If the model does NOT flag the deleted first-7-seconds rule, that is a fine
 * outcome - capture whatever stale rule it does produce. The argument is about
 * unverifiable policy claims from model memory, not about one specific rule.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { env, hasKey, requireKey } from '../src/lib/env';
import { loadPack } from '../src/policy/loader';
import { detect } from '../src/pipeline/detect';
import { adjudicate } from '../src/pipeline/adjudicate/adjudicate';
import { fixturesDir, samplesDir } from '../src/store/paths';
import type { CompareDocument, NaiveIssue } from '../src/store/compare';
import type { Transcript } from '../src/types/transcript';

const FIXTURE = 'clip-01';
const TITLE = 'This patch is a fucking disaster';

const NAIVE_SYSTEM =
  'You are a YouTube monetization expert. Review the transcript and identify anything ' +
  'that would cause the video to be demonetized or given limited ads under YouTube\'s ' +
  'advertiser-friendly guidelines.';

const NAIVE_USER = (transcript: string, title: string) =>
  `Video title: ${title}

Transcript:
${transcript}

List every policy violation you find. For each one give the rule, the severity, and where in the video it occurs.`;

/**
 * Detects whether a free-text model response leans on a rule the pack records
 * as deleted. Deliberately conservative: it looks for the timing language the
 * deprecated rules are actually about, not for any mention of profanity.
 */
export function findDeprecatedClaims(text: string): string[] {
  const patterns: [string, RegExp][] = [
    ['first 7 seconds', /first\s+(seven|7)\s+seconds/i],
    ['first 15 seconds', /first\s+(fifteen|15)\s+seconds/i],
    ['profanity in the opening', /profanit\w*[^.]{0,60}(opening|first few seconds|start of the video)/i],
    ['opening-seconds demonetization', /(demonetiz\w+|limited ads|yellow)[^.]{0,60}first\s+\d+\s+seconds/i],
  ];
  return patterns.filter(([, re]) => re.test(text)).map(([label]) => label);
}

/** Pulls a rough issue list out of free text. Presentation only; raw text is stored too. */
export function parseIssues(text: string): NaiveIssue[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^([-*]|\d+\.)\s+/.test(l))
    .map((l) => l.replace(/^([-*]|\d+\.)\s+/, ''));

  return lines.slice(0, 8).map((line) => {
    const severity = /no ad|demonetiz|not eligible/i.test(line)
      ? 'no ads'
      : /limited|yellow/i.test(line)
        ? 'limited ads'
        : 'unspecified';
    const location = /first\s+\d+\s+seconds|\d+:\d{2}|opening/i.exec(line)?.[0] ?? 'not specified';
    return { rule: line.slice(0, 220), severity, location };
  });
}

async function main() {
  const dry = process.argv.includes('--dry');
  const pack = loadPack();

  const transcript = JSON.parse(
    readFileSync(path.join(fixturesDir(), `${FIXTURE}.transcript.json`), 'utf8'),
  ) as Transcript;

  // --- Greenlight's side: the real pipeline, no shortcuts --------------------
  const detected = detect({ transcript, pack, title: TITLE });

  let findings: CompareDocument['greenlight']['findings'] = [];
  let dropped: CompareDocument['greenlight']['dropped'] = [];
  let cleared: CompareDocument['greenlight']['clearedSpans'] = [];

  if (!dry && hasKey('ANTHROPIC_API_KEY')) {
    const gate = await adjudicate({
      scanId: 'compare',
      candidates: detected.candidates,
      pack,
      transcript,
      durationMs: transcript.durationMs,
      dropsPath: null,
    });

    findings = gate.findings.map((f) => ({
      clauseId: f.clauseId,
      clauseTitle: f.clauseTitle,
      effectiveDate: f.effectiveDate,
      sourceUrl: f.sourceUrl,
      severity: f.severity,
      startMs: f.startMs,
      endMs: f.endMs,
      evidence: f.evidence,
      remediation: f.remediation,
    }));

    const withFindings = new Set(gate.findings.map((f) => f.candidateId));
    cleared = detected.candidates
      .filter((c) => !withFindings.has(c.id) && c.endMs > c.startMs)
      .map((c) => ({
        startMs: c.startMs,
        endMs: c.endMs,
        evidence: c.evidence,
        why: 'Adjudicated against the clause text and matched nothing in the current pack.',
      }));

    dropped = Object.entries(gate.drops.byReason()).map(([reason, count]) => ({ reason, count }));
  }

  // --- the naive side: a real call, or nothing at all ------------------------
  let rawResponse: string | null = null;
  let model: string | null = null;

  if (!dry && hasKey('ANTHROPIC_API_KEY')) {
    const client = new Anthropic({ apiKey: requireKey('ANTHROPIC_API_KEY') });
    model = env.ANTHROPIC_MODEL;
    const res = await client.messages.create({
      model,
      max_tokens: 1200,
      temperature: 0,
      system: NAIVE_SYSTEM,
      messages: [{ role: 'user', content: NAIVE_USER(transcript.text, TITLE) }],
    });
    rawResponse = res.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
      .trim();
  }

  const deprecatedRuleMatches = rawResponse ? findDeprecatedClaims(rawResponse) : [];

  const doc: CompareDocument = {
    status: rawResponse ? 'captured' : 'placeholder',
    clipId: FIXTURE,
    title: TITLE,
    capturedAt: rawResponse ? new Date().toISOString() : null,
    packVersion: pack.version,
    naive: {
      model,
      systemPrompt: NAIVE_SYSTEM,
      userPromptPreview: `${NAIVE_USER(transcript.text, TITLE).slice(0, 400)}…`,
      rawResponse,
      issues: rawResponse ? parseIssues(rawResponse) : [],
      citesDeprecatedRule: deprecatedRuleMatches.length > 0,
      deprecatedRuleMatches,
    },
    greenlight: { clearedSpans: cleared, findings, dropped },
    deprecatedRules: pack.pack.deprecated_rules.map((d) => ({
      id: d.id,
      title: d.title,
      removedOn: d.removed_on,
      sourceUrl: d.source_url,
      evidence: d.evidence.trim(),
      whyPeopleStillBelieveIt: d.why_people_still_believe_it.trim(),
    })),
  };

  const out = path.join(samplesDir(), 'naive-compare.json');
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

  console.log(`\nwrote ${out}`);
  console.log(`status: ${doc.status}`);
  if (doc.status === 'placeholder') {
    console.log(
      dry
        ? '\nDry run. Prompts written, no model called.'
        : '\nNo ANTHROPIC_API_KEY, so nothing was captured.',
    );
    console.log('The /compare page will show an uncaptured state until this runs for real.');
    console.log('\nNaive system prompt:\n');
    console.log(NAIVE_SYSTEM);
  } else {
    console.log(`naive model: ${model}`);
    console.log(
      `cites a deprecated rule: ${doc.naive.citesDeprecatedRule} ${
        deprecatedRuleMatches.length ? `(${deprecatedRuleMatches.join(', ')})` : ''
      }`,
    );
    console.log(`greenlight findings: ${findings.length}, cleared spans: ${cleared.length}`);
    if (!doc.naive.citesDeprecatedRule) {
      console.log(
        '\nThe model did not reach for a deleted timing rule this time. That is fine - read the ' +
          'raw response and see which unverifiable claim it DID make. The argument is that a bare ' +
          'model asserts policy from memory with no citation and no date, not that it always picks ' +
          'the same wrong rule.',
      );
    }
  }
}

/**
 * Only run when invoked directly. `findDeprecatedClaims` and `parseIssues` are
 * unit-tested, and importing this module must not fire a model call or rewrite
 * the committed comparison JSON as a side effect of running the test suite.
 */
const invokedDirectly = /make-naive-compare/.test(process.argv[1] ?? '');
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
