# Eval results

Pack `youtube-afg@2026.09.01` · 1 clip · 3 labelled spans · run 2026-09-06

**Mode:** DETECTOR STAGE ONLY. Candidates are scored by category, before any clause is assigned. Plane 4 is built for high recall and deliberately low precision, so the precision figure here is expected to be poor and is not comparable to the adjudicated run.

## Scope

These numbers measure **detection recall against hand-labelled spans, not prediction accuracy against YouTube's private monetization decisions.** Monetization status is visible only to the channel owner, so no third party can honestly measure the second thing. Anyone publishing a "demonetization accuracy" figure has measured something else.

## Overall

| Metric | Value |
|---|---|
| Recall | 1.00 |
| Precision | 0.60 |
| False positives per clip | 2.00 |
| Labelled spans | 3 |
| Found / missed | 3 / 0 |
| Hits on labelled negatives | 1 |

## By category

| Category | Recall | Precision | TP | FN | FP |
|---|---|---|---|---|---|
| inappropriate_language | 1.00 | 0.33 | 1 | 0 | 2 |
| packaging | 1.00 | 1.00 | 1 | 0 | 0 |
| sensitive_events | 1.00 | 1.00 | 1 | 0 | 0 |

## Labelled negatives

Spans that must **not** fire. A checker that flags everything scores perfect recall and is useless, so these are scored explicitly.

Not enforced in this mode. Detectors are *supposed* to raise candidates inside these spans — the isolated strong word at 0:01 is exactly the thing that must be detected and then cleared. The check only means something once the Gate has run.

| Negative | Fired anyway | Note |
|---|---|---|
| N1 | (candidate:lexicon) | Isolated strong profanity at 0:01. MUST NOT be flagged. The first-7-seconds rule was deleted in July 2025, and an isolated strong word in the video body is ad-eligible. This is the single label that separates Greenlight from a naive checker. |

## Per clip

### clip-01 — Commentary — patch reaction

5 candidates · 3 found · 0 missed · 2 false positives

## Reproducing

```bash
npm run eval                 # adjudicated, needs ANTHROPIC_API_KEY
npm run eval -- --candidates # detector stage only, no key required
```

Ground truth lives in `evals/fixtures/*.labels.json` and is hand-written. Overlap tolerance is 2000ms.
