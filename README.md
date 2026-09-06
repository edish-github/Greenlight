# Greenlight

**YouTube tells you *that* your video got the yellow icon. Greenlight tells you which six seconds, cites the clause, and fixes them.**

<!-- Replace with a screenshot of the report screen, red bands visible, above the fold. -->
<!-- ![The report screen](docs/screenshots/report.png) -->

---

## The problem

You finish a twenty-minute edit, render for forty minutes, upload, and get a yellow dollar icon: limited ads. YouTube does not tell you which seconds caused it, so your options are to publish and eat the revenue hit, request a human review and lose the first-24-hour traffic window where most of a video's lifetime revenue lives, or guess, re-edit, re-render and re-upload. The feedback loop is slow, coarse, and offers no repair path.

There is a second problem almost nobody knows about. The most repeated piece of monetization advice on the internet — *never swear in the first seven seconds* — **was deleted in July 2025**. YouTube's ad guideline update log records that stronger profanity in the first 7 seconds can now earn ad revenue. Every creator blog still repeats it, every tips video still repeats it, and so does every large language model, because it was true for most of the window their training data covers. A "demonetization checker" built by pasting a transcript into a model will confidently flag a rule that no longer exists.

Greenlight's architecture exists to make that failure structurally impossible.

## What it does

Drop in a finished MP4 with the title you plan to publish. Greenlight returns a timestamped risk map where every finding carries a clause ID, its effective date, and a link to the live help-centre page. Tick the findings you want repaired, and it compiles every approved span into **one** `filter_complex`, renders `fixed.mp4` in a single pass, then puts the corrected file back through the identical pipeline and shows you the timeline turn green.

```
00:00.9  strong profanity   →  DETECTED, then CLEARED  (no clause matched)
00:55.4  four strong terms  →  AFG-LANG-002  limited ads  effective 2025-07  → bleep
01:30.8  sensitive events   →  AFG-SENS-001  no ads       effective 2025-06  → manual review
title    profanity          →  AFG-PKG-001   no ads       effective 2025-07  → suggested edit
```

That first line is the product. The word is detected, handed to the adjudicator with the clause text, and cleared — because an isolated strong word in the video body is ad-eligible under the current guidelines. The count of cleared spans is shown on screen. A system that reports what it rejected reads very differently from one that reports only what it found.

## What Greenlight does not do

- **It does not predict YouTube's decision.** YouTube reviews the whole video in context, and its systems can be wrong. The disclaimer is part of the `Verdict` data contract, not a UI decision, so it cannot be refactored away.
- **It does not identify music.** Music is flagged as present for you to verify licensing, never identified.
- **It does not touch your channel.** No OAuth, no API writes, no uploads. It cannot reach your account even in principle.
- **It does not scrape YouTube.** The input is a local file.
- **It does not guarantee a green icon,** and the UI never uses that word about the future.
- **The revenue figure is a range with its assumption printed beside it.** No official percentage for the cost of limited ads exists on any Google page, and the widely-quoted "50–80%" figures are unsourced. Every input on that line is editable.
- **It will not claim a fix worked when it could not check.** If the re-scan runs without a transcript or without the Gate, nothing is marked resolved and the report says so. A green timeline meaning "we could not look" is the most misleading thing this product could produce.

## Architecture

**Policy is data, not model memory.** Every clause lives in a versioned YAML pack with an ID, an effective date, a severity, a surface, a detector type, a remediation type and a source anchor. Deterministic local detectors generate candidate spans for free in under 100ms — high recall, deliberately low precision. The model's only job is to adjudicate: it sees one candidate, the clause text for that candidate's category, and a ±20s transcript window. It has no web access, is never handed the full corpus, and is told explicitly that the clause block is the complete current rule set. Its output is parsed by Zod, checked against an allowlist built from the live clauses only, and range-checked against the video duration. Severity and remediation are then read from the pack, not from the model. Scoring is a pure function. Remediation is one ffmpeg pass.

```
① input surfaces  →  ② ingest  →  ③ evidence  →  ④ candidate generators
                                                          ↓
⑨ report / exports  ←  ⑧ remediation  ←  ⑦ scoring  ←  ⑥ THE GATE  ←  ⑤ policy pack
```

### The five invariants

| # | Invariant | Enforced by |
|---|---|---|
| I1 | Policy lives in versioned data, never in a prompt written from memory | `src/policy/packs/*.yaml`, `policy.test.ts` |
| I2 | A finding cannot exist without a clause ID in the loaded pack's allowlist | `loader.ts` guardrail, `gate.test.ts` |
| I3 | Cheap deterministic detectors generate candidates; the model only adjudicates | `detect/`, `detect.test.ts` |
| I4 | The pipeline is a pure function of (bytes, pack version, title, thumbnail) | `scanIdFor()`, `verdict.test.ts` |
| I5 | Every external dependency has a labelled degraded state | ASR ladder, `DegradedBanner`, `diff.ts` |

### Data contracts

```ts
Finding   { clauseId, clauseTitle, clauseText, clauseTextStatus, effectiveDate,
            sourceUrl, surface, startMs, endMs, evidence, severity, confidence,
            rationale, remediation, detector, candidateId, state }

Verdict   { status, headline, drivers[<=3], confidence, counts,
            revenueAtRisk { low, high, assumption, editable }, disclaimer }

FixPlan   { scanId, items[{ findingId, type, startMs, endMs, suggestion?, box? }],
            dismissed[] }

ScanDiff  { resolved[], persisted[], fresh[], counts, allClear, trustworthy, summary }
```

`clauseTextStatus` is `verbatim` or `paraphrase`, and the UI renders it next to every citation. A paraphrase labelled as a paraphrase is honest; a paraphrase presented as a quotation is exactly the failure this architecture exists to prevent.

## The guardrail, demonstrated

`tests/no-seven-second-rule.test.ts` hands the Gate an **adversarial** adjudicator that tries to cite the deleted rule on every candidate, and asserts the report still comes back green:

```ts
const staleModel: ToolInvoker = async () => ({
  toolInput: { findings: [{ clause_id: 'AFG-LANG-DEP-7SEC', confidence: 0.97, ... }] },
  ...
});

expect(gate.findings).toHaveLength(0);
expect(gate.drops.byReason().unknown_clause).toBe(candidates.length);
expect(scoreVerdict(gate.findings).status).toBe('green');
```

The rule cannot be cited because it is not in the allowlist. `/compare` makes the same argument against a real bare model, captured to static JSON and committed so the page makes no API calls.

## Eval results

```
Pack youtube-afg@2026.09.01 · 1 clip · 3 labelled spans · detector stage
```

| Category | Recall | Precision | TP | FN | FP |
|---|---|---|---|---|---|
| inappropriate_language | 1.00 | 0.33 | 1 | 0 | 2 |
| packaging | 1.00 | 1.00 | 1 | 0 | 0 |
| sensitive_events | 1.00 | 1.00 | 1 | 0 | 0 |
| **Overall** | **1.00** | **0.60** | 3 | 0 | 2 |

**Read this honestly.** It is one clip and three labelled spans, run at the detector stage, where precision is *expected* to be poor because plane ④ is built for recall and the Gate supplies the precision. It is a working harness, not a broad benchmark. Run `npm run eval` with a key for the adjudicated numbers, and expand `evals/fixtures/` before drawing conclusions. Full output in [`evals/RESULTS.md`](evals/RESULTS.md).

**Scope, precisely:** these numbers measure **detection recall against hand-labelled spans, not prediction accuracy against YouTube's private monetization decisions.** Monetization status is visible only to the channel owner, so no third party can honestly measure the second thing. Anyone publishing a "demonetization accuracy" figure has measured something else.

The harness also scores **labelled negatives** — spans that must *not* fire, including the isolated strong word at 0:01. A checker that flags everything scores perfect recall and is useless. A finding on a negative span exits the run non-zero.

## Unit economics

Estimated per 3-minute clip, cold:

| Stage | Time | Cost | Calls |
|---|---|---|---|
| Demux | ~3s | 0 | 0 |
| Transcribe | ~6s | ~$0.001 | 1 |
| Vision | ~8s | ~$0.04 | 5 |
| Candidates | <0.1s | 0 | 0 |
| Adjudicate | ~6s | ~$0.02 | 1–3 |
| **Total** | **~23s** | **~$0.06** | **7–9** |

Vision calls are batched 8 frames per request and capped at 40 frames regardless of video length, so a 60-minute video costs the same as a 3-minute one. A fix render adds ~4s and zero cost; a full scan-fix-rescan cycle is roughly $0.12.

These are projections from measured stage timings and published token pricing, not a metered bill. The ffmpeg and detection stages are measured; the provider costs are not.

## Quickstart

```bash
cp .env.example .env.local     # every key is optional for the commands below
npm install
npm test                       # 85 tests, no key and no network
npm run dev                    # http://localhost:3000
```

Nothing above needs an API key. The landing page's sample card opens a full pre-computed report with zero external calls.

```bash
npm run detect -- evals/fixtures/clip-01.transcript.json --title "..." --mock-gate
npm run scan   -- clip.mp4 --title "..." --words     # needs GROQ_API_KEY
npm run eval   -- --candidates                       # offline eval
npm run policy:check                                 # pack freshness + guardrail audit
npm run samples                                      # re-bake the judge-mode clips
npm run compare:capture                              # capture the bare-model comparison
```

Docker:

```bash
docker build -t greenlight .
docker run -p 3000:3000 -v greenlight-data:/data --env-file .env.local greenlight
```

## Repo map

| Path | What lives there |
|---|---|
| `src/policy/` | The source of truth: versioned pack, lexicons, loader, allowlist guardrail |
| `src/pipeline/extract/` | ffprobe, audio extraction, scene-change keyframes |
| `src/pipeline/transcribe/` | ASR ladder: Groq -> OpenAI -> local -> labelled degraded state |
| `src/pipeline/detect/` | Deterministic candidate generators. No policy opinions allowed |
| `src/pipeline/adjudicate/` | The Gate: prompt, Zod contract, three-stage rejection, drop log |
| `src/pipeline/score/` | Verdict and revenue range. Pure functions |
| `src/pipeline/remediate/` | Pure filter builder, fix planner, single-pass renderer, re-scan diff |
| `app/api/` | scan · poll · fix · serve. All `runtime = 'nodejs'` |
| `components/` | The report screen. Rendering only |
| `evals/` | Ground truth and the scoring harness |
| `scripts/` | Dev tooling. Never imported by the running app |
| `tests/` | Seven suites, each defending a named invariant |

## Built during the hackathon

All work was done between **3 September 2026** and the submission deadline on **8 September 2026**. The repo has no pre-existing history; the first commit is the `create-next-app` scaffold.

```bash
git log --oneline | wc -l                                    # commit count
git log --reverse --date=short --pretty='%ad %s' | head -1   # first commit
git log --date=short --pretty='%ad %s' | head -1             # most recent
```

Phase notes written as the work happened: [`docs/PHASE-0-1-STATUS.md`](docs/PHASE-0-1-STATUS.md), [`docs/PHASE-2-3-STATUS.md`](docs/PHASE-2-3-STATUS.md). They include the bugs, not just the features.

## Roadmap

- **Additional policy packs.** TikTok, Twitch, Meta. A data change, not a code change.
- **Watch-folder daemon.** Point it at your export directory; every render gets scanned.
- **Premiere / Resolve panel.** Findings land as timeline markers, so nothing leaves the edit.
- **Pack subscription.** Policy changes constantly. A maintained, versioned, dated pack with a changelog is the real business, and the July 2025 deletion is the proof that the maintenance problem is real.

## Licence

MIT. See [`LICENSE`](LICENSE).
