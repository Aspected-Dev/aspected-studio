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
closer to the start config (parsimony). Screen measures every aspect it drops
against the start config rather than against the drop it accepted last, so
parsimony costs at most one noise floor however many aspects a set has.

`fetchK` is how many documents each case fetches. Grading still uses each case’s
`k` (or the set default). Deeper retrieval can change which docs appear; it does
not silently change the graded cut-off. `fetchK` is a floor, not a ceiling: a
case that overrides the set `k` with a deeper one fetches at its own cut-off, so
grading never reads past the rows that came back. The Depth stage multiplies the
**deepest** case cut-off in the set rather than the set `k`, so every candidate
it offers is meaningful for every case.

Weight `0` turns an aspect **off**: it is omitted from every case query (same
path as Scorecard’s `activeCaseAspects`).

Every case in scope scores, on every trial. A case that errored, or that the
candidate config left with nothing to query, counts as `0` instead of dropping
out. Macro means weight each case equally, so a dropped case would raise the
score: without this, a transient server failure on the hardest case could win
the run. Turning off the only aspect a case queries is therefore a real cost,
not a free simplification.

## Stages

1. **Baseline**: start config, all-weights-1 (if different), noise repeat
2. **Screen**: try turning each tunable aspect off, keeping a drop only when it
   stays within the noise floor of the **start** config
3. **Coarse**: Live coordinate ascent on a log grid (~0.1…10)
4. **Refine**: local steps around winners
5. **Depth**: optional `1× / 2× / 4×` the deepest case grading `k` as `fetchK`
6. **Confirm**: re-check top trials; score holdout when enabled

Budget is counted in **searches**, not trials. A per-case signature cache means
changing one aspect does not re-run cases that never query it.

A trial's cost is only known once it has run, so the budget bounds where the
next trial may **start**. A run can therefore finish up to one trial past the
number you set, never a whole queued batch past it.

## Setup controls

- Golden set
- Per-aspect: tune weight / allow off / freeze. Defaults freeze aspects the
  selected set never queries; switching sets rebuilds those defaults.
- Budget presets: Quick 250, Standard 1000, Thorough 4000, or custom
- Concurrency (default 4)
- Train/holdout split (on when the set has enough runnable cases)
- Optional wall-clock cap

## Results and saved configs

When a run finishes (or you Stop), the champion is auto-saved under
`aspected-studio.tuned-configs`. The results card shows start vs champion,
holdout, rationale, per-case deltas, and a leaderboard. Each result tile has a
help icon with the same wording as below.

### Reading the three tiles

| Tile                   | Meaning                                                                                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Start objective**    | Score of the config you began with (often all weights 1), on the **train** split when holdout is on. Objective = primary metric (usually nDCG) minus a forbidden-case penalty; each case counts equally.                                                                                        |
| **Champion objective** | Best config found on **train** under the budget. Compare to Start. A gain within the noise floor is treated as a tie (parsimony may still change which config wins).                                                                                                                            |
| **Holdout**            | Same objective on cases **not** used while searching. Scored once in Confirm. Close to the train champion → the win likely generalizes. Much lower → possible overfit or an unlucky split (especially on small sets). `n/a` means holdout was off, the set was too small, or Confirm never ran. |

Per-case deltas compare the baseline runs against the **champion's** runs, so
they always describe the config you are about to save rather than whichever
trial finished last. They cover the train split only, so a run with a holdout
lists fewer cases than the set has.

The holdout is scored once, in Confirm. A run that spends its budget or is
stopped earlier leaves the tile at `n/a` and says so, which is a different
message from the one you get when there was no split to score.

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
- Tutorial: [Movies Auto-tune readiness](tutorials/07-movies-auto-tune.md)
