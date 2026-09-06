# Greenlight

**YouTube tells you *that* your video got the yellow icon. Greenlight tells you *which six
seconds*, cites the clause, and fixes them.**

A pre-publish linter for video. Drop in a finished MP4 with the title you plan to use, and
Greenlight returns a timestamped risk map where every finding carries a real clause ID, its
effective date and a link to the live help-centre page. Approve a fix plan, and it renders
a corrected MP4 in one ffmpeg pass, then re-scans it and shows the timeline turn green.

It is not a chatbot, it is not a generator, and it does not claim to predict YouTube's
decision. It locates, cites and repairs.

> **Build status: Phase 0 and Phase 1 complete.** Policy engine, detection stack, the Gate,
> scoring and the CLI harness all work end to end. The fix renderer, the re-scan loop and
> the UI land on Day 2 and Day 3. See `docs/PHASE-0-1-STATUS.md`.

---

## Why this exists

The most repeated piece of YouTube monetization advice on the internet is "never swear in
the first 7 seconds." **That rule was deleted in July 2025.** YouTube's ad guideline update
log records that stronger profanity in the first 7 seconds can now earn ad revenue.

Every creator blog still repeats it. Every tips video still repeats it. And so does every
large language model, because it was true for most of the window their training data covers.

So a "demonetization checker" built by pasting a transcript into a model will confidently
flag a rule that no longer exists. Greenlight's architecture exists to make that failure
structurally impossible:

```
policy lives in versioned YAML  ->  the loader builds an allowlist from live clauses only
                                ->  the model may only cite ids in that allowlist
                                ->  anything else is dropped and counted before the UI
```

There is a test named after this. `tests/no-seven-second-rule.test.ts` hands the Gate an
adversarial adjudicator that tries to cite the dead rule on every candidate, and asserts
the report still comes back green.

## Quickstart

```bash
cp .env.example .env.local     # keys are optional for everything below
npm install
npm test                       # 43 tests, no key and no network required
```

Run the detection stack against a transcript fixture — no media, no ASR, no API key:

```bash
npm run detect -- evals/fixtures/clip-01.transcript.json \
  --title "This patch is a fucking disaster"
```

Add `--mock-gate` to run the full Gate, scoring and verdict path with a deterministic
offline stub in place of the model. Add `--gate` to use the real adjudicator
(needs `ANTHROPIC_API_KEY`).

Run the whole pipeline on a real file:

```bash
npm run scan -- clip.mp4 --title "..." --words     # needs GROQ_API_KEY for ASR
npm run scan -- clip.mp4 --no-llm                  # detection only, no model calls
npm run policy:check                               # pack freshness and guardrail audit
```

## What the output looks like

```
CANDIDATES  5 in 11ms  {"packaging":1,"lexicon":2,"density":1,"focus":1}

  00:00.9-00:01.7  lexicon   audio       inappropriate_language
  00:55.4-01:01.9  density   audio       inappropriate_language
  01:30.8-01:42.7  focus     video_body  sensitive_events

GATE  3 findings | 2 cleared | 0 dropped {}

  00:55.4-01:01.9  LIMITED_ADS  AFG-LANG-002 - Profanity used repeatedly or throughout
      effective 2025-07 | paraphrase | https://support.google.com/youtube/answer/6162278#...
      fix bleep | confidence 0.82 | detector density
```

The strong profanity at 0:00.9 is detected, handed to the Gate, and **cleared** — because
under the current guidelines an isolated strong word in the video body is ad-eligible.
That cleared count is shown on screen. A system that reports what it rejected reads very
differently from one that reports only what it found.

## Architecture in one paragraph

Policy is data, not model memory. Every clause lives in a versioned YAML pack with an id,
an effective date, a severity, a surface, a detector type, a remediation type and a source
anchor. Deterministic local detectors generate candidate spans for free in under 100ms.
The model's only job is to decide whether a candidate matches a clause whose text has been
handed to it — it has no web access, it is never given the full corpus, and it is
explicitly told the clause block is the complete current rule set. Its output is parsed by
Zod, checked against the allowlist, and range-checked against the video duration. Severity
and remediation are then read from the pack, not from the model. Full detail in
`docs/02-ARCHITECTURE.md`.

## What Greenlight explicitly does not do

- It does not predict YouTube's decision. YouTube considers the whole video in context and
  its systems can be wrong.
- It does not detect copyrighted music. Music is flagged as present, never identified.
- It does not touch your channel. No OAuth, no API writes, no uploads.
- It does not scrape YouTube. The input is a local file.
- It does not guarantee a green icon, and the UI never uses that word about the future.
- The revenue-at-risk figure is a range with its assumption printed beside it. No official
  percentage for the cost of limited ads exists on any Google page.

## Repo map

| Path | What lives there |
|---|---|
| `src/policy/` | The source of truth: the versioned pack, the lexicons, the loader, the guardrail |
| `src/pipeline/extract/` | ffprobe, audio extraction, scene-change keyframes |
| `src/pipeline/transcribe/` | ASR ladder: Groq -> OpenAI -> local -> labelled degraded state |
| `src/pipeline/detect/` | Deterministic candidate generators. No policy opinions allowed |
| `src/pipeline/adjudicate/` | The Gate: prompt, Zod contract, three-stage rejection, drop log |
| `src/pipeline/score/` | Verdict and revenue range. Pure functions |
| `src/lib/ffmpeg.ts` | The only module permitted to spawn a process |
| `src/store/paths.ts` | Every filesystem path in the app derives from here |
| `scripts/` | Dev tooling. Never imported by the running app |
| `tests/` | Five suites, each defending a named invariant |

## Licence

See `LICENSE`.
