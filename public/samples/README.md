# Sample clips

Three clips live here. They are the judge-mode path: their reports are
pre-computed, committed under `scans/`, and resolve with **zero external API
calls**. The demo video is recorded from this path so that neither a rate limit
nor a downed provider nor bad wifi can break it on camera.

## Recording them

Record your own footage. Fifteen minutes of work that removes a whole category
of licensing risk from a public submission.

- 60–90 seconds each, under 25MB, so the repo stays clonable
- Plant the risks listed in `clips.config.json` for each clip and write down the
  real timestamp of each one — that list is your eval ground truth
- Clip A must contain a strong word in the first few seconds. It is there to be
  **cleared**, not flagged. That is the demo's whole argument.

## Baking

```bash
npm run samples
```

This runs the full pipeline over each clip, copies the finished scan directories
into `public/samples/scans/`, and writes `samples.json`.

**Re-bake after any pipeline or policy pack change.** The scan id is derived
from the pack version, so bumping the pack orphans the baked scans and the
sample cards stop resolving.

## Verifying judge mode

Pull the network cable, then click a sample card. A full report must still
render. If it does not, the demo is not safe to record.
