# Auto-tune

Budgeted **Live** search for aspect weights, aspect on/off, and retrieval depth
on a golden set. Route: `/indexes/:name/auto-tune`.

This is the production finetune tool. Playground **Quick suggest (preview)** is
a fast diagnostic on the cached window only. Prefer Auto-tune when quality has
to match what the server returns.

## What it optimizes

Primary metric = the golden set’s `thresholds.metric` (usually nDCG), graded on
**server order** (not local Preview re-rank).

Objective value = primary minus a forbidden-case penalty, so policy violations
cannot be traded for a tiny metric gain. Among configs within the measured noise
floor, Auto-tune prefers fewer enabled aspects, then smaller `fetchK`, then
closer to the start config (parsimony).

`fetchK` is how many documents each case fetches. Grading still uses each case’s
`k` (or the set default). Deeper retrieval can change which docs appear; it does
not silently change the graded cut-off.

Weight `0` turns an aspect **off**: it is omitted from every case query (same
path as Scorecard’s `activeCaseAspects`).

## Stages

1. **Baseline**: start config, all-weights-1 (if different), noise repeat
2. **Screen**: try turning each tunable aspect off
3. **Coarse**: Live coordinate ascent on a log grid (~0.1…10)
4. **Refine**: local steps around winners
5. **Depth**: optional `1× / 2× / 4×` set `k` as `fetchK`
6. **Confirm**: re-check top trials; score holdout when enabled

Budget is counted in **searches**, not trials. A per-case signature cache means
changing one aspect does not re-run cases that never query it.

## Setup controls

- Golden set
- Per-aspect: tune weight / allow off / freeze
- Budget presets: Quick 250, Standard 1000, Thorough 4000, or custom
- Concurrency (default 4)
- Train/holdout split (on when the set has enough runnable cases)
- Optional wall-clock cap

## Results and saved configs

When a run finishes (or you Stop), the champion is auto-saved under
`aspected-studio.tuned-configs`. The results card shows start vs champion,
holdout, rationale, per-case deltas, and a leaderboard.

Load a saved config from:

- Playground Scorecard tab: **Load tuned config**
- Scorecard page: next to **Weights under test**

## Production guidance

Auto-tune can issue hundreds or thousands of searches. Prefer a replica, staging
index, or off-peak window. Cap concurrency and use Stop if the server is under
load. A bad golden set produces confident-looking wrong weights: invest in
judgements first.

## Related

- [Scorecard](scorecard.md)
- [Playground](playground.md) (Quick suggest is Preview-only)
- [Architecture](architecture.md)
- Tutorial: [Auto-tune the catalog](tutorials/06-auto-tune.md)
