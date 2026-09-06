# Policy verification checklist

**Status: 12 clauses shipped, 0 verified verbatim. Do this Friday morning. It is research, not coding.**

Every clause in `src/policy/packs/youtube-afg-2026.09.yaml` currently carries
`text_status: paraphrase` and `verified_at: null`. That is honest — the summaries were
written from the live guidelines, not copied from them — but a paraphrase is weaker
evidence than a citation, and the citation is the whole product.

## What to do

Open two tabs and keep them open:

- Advertiser-friendly content guidelines — <https://support.google.com/youtube/answer/6162278>
- Ad guideline update log — <https://support.google.com/youtube/answer/9725604>

For each clause below:

1. Find the corresponding section on the guidelines page.
2. Check the summary in `clause_text` actually says what the page says. Fix it if not.
3. Check `severity` matches the tier the page puts it in (no ad revenue / limited / can earn).
4. Check `source_anchor` scrolls to the right section when appended to `source_url`.
5. Set `verified_at: "2026-09-04"` (today's date) and, if you replaced the summary with a
   short quoted excerpt, set `text_status: verbatim`.

Keep quoted excerpts short and attributed. Never paste a whole section — the pack is a
citation index, not a mirror of Google's page.

## Clause checklist

- [ ] `AFG-LANG-001` Slurs and language that demeans a protected group — `no_ads`
- [ ] `AFG-LANG-002` Profanity used repeatedly or throughout — `limited_ads`
- [ ] `AFG-PKG-001` Profanity in the title or thumbnail — `no_ads`
- [ ] `AFG-VIOL-001` Graphic violence as the focus — `limited_ads`
- [ ] `AFG-VIOL-002` Real-world violent acts in detail — `no_ads`
- [ ] `AFG-SENS-001` Recent tragedy and sensitive events — `no_ads`
- [ ] `AFG-ADULT-001` Sexually suggestive themes — `limited_ads`
- [ ] `AFG-DRUG-001` Recreational drugs — `limited_ads` *(check the 2026 gaming/scripted carve-out)*
- [ ] `AFG-HARM-001` Harmful or dangerous acts — `limited_ads`
- [ ] `AFG-CONTRO-001` Controversial issues — `limited_ads`
- [ ] `AFG-FIRE-001` Firearms sales, assembly, modification — `no_ads`
- [ ] `AFG-SHOCK-001` Shocking content and gore — `no_ads`

## Deprecated rules

- [ ] `AFG-LANG-DEP-7SEC` — confirm on the update log that stronger profanity in the first
      7 seconds is now eligible to earn ad revenue (announced 29 July 2025). This entry is
      the one the demo turns on; get the wording of `evidence` exactly right.
- [ ] `AFG-LANG-DEP-15SEC` — the November 2022 original, narrowed in March 2023.

## Two things worth checking specifically

1. **Search the inappropriate-language section for the word "seconds".** If it is absent,
   the deprecation entry is correct and you can say so on camera with confidence.
2. **The violence section still has timing language** (graphic gaming content in the first
   seconds). Do not let the demo imply that *all* timing rules were deleted — only the
   profanity one was. Overclaiming here is the one thing that would undercut the kill shot.

## Empty by design

`src/policy/lexicons/en-tiered.json` ships with an empty `slur` tier, so `AFG-LANG-001`
currently cannot fire. Populate it from a maintained, licensed list and record the source
in `slur_source`, or drop the clause before submitting. Do not hand-write one.

## After verifying

```bash
npm run policy:check    # warns on unverified clauses, fails on a guardrail breach
npm test                # tests/policy.test.ts re-asserts the guardrail independently
```

Then bump `pack.version` if any clause text changed. The version is part of the scan id,
so a bump invalidates every cached scan automatically — including the baked sample clips,
which must be re-baked afterwards.
