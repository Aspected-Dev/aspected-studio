# Architecture

Design decisions that are easy to lose if they only live in code comments.

## Client-side re-rank needs explanations

Playground and Scorecard previews never re-embed text on the client. They need
the server to return **per-aspect distances** (`withExplanation: true`) so
Studio can divide the request weight back out of each slice and recombine under
new weights.

That is why Auto-run and scorecard runs always ask for explanations, and why an
aspect sent at weight `0` cannot be raised in a preview: the server returned no
distance for it, so the client marks the preview **Stale** rather than guessing.

Core math lives in `src/lib/aspected/scoring.ts` (`rerank`, contribution bars).

## Live, Preview, Stale

| Badge   | Meaning                                                                     |
| ------- | --------------------------------------------------------------------------- |
| Live    | Distances (or grades) match what the server last returned for these weights |
| Preview | Re-scored locally at weights the server has not been asked about            |
| Stale   | The query changed, or an aspect lacked a recovered grade                    |

Only documents already in the fetched top `k` can move. A document that would
_enter_ the top `k` under new weights cannot appear until a real search lands.
The same limit applies to scorecard Preview: forbidden hits inside the window
stay until **Run set** fetches a new neighbourhood.

## Cosine is a weighted mean of aspects

Manhattan, Euclidean, and DotProduct accumulate per dimension, so an aspect’s
slice sums into the total and local re-score is exact.

Cosine normalises across every dimension at once. Studio approximates it as a
**weighted mean of per-aspect distances**. That is exact when query and document
vectors share a norm (radial resolvers: `enum`, `number`, `datetime`, `dict`)
and close for `text`. The Preview badge reports measured deviation on Cosine
indexes so the approximation is never hidden.

## Compare vs Scorecard

| Surface                            | Unit of comparison    | Question              |
| ---------------------------------- | --------------------- | --------------------- |
| Compare tab                        | One query’s ranking   | Did the list shuffle? |
| Scorecard (page or Playground tab) | A golden set of cases | Did quality move?     |

**Pin A** on Compare freezes form values, rows, and weights from a real search.
Restore A writes them back. On the Playground Scorecard tab, pinned weights also
become the **baseline** for metric deltas (`nDCG +0.019`). Pinning is optional
for grading chips and the weight sweep; it only adds the delta column.

Kendall tau is deliberately unused for Compare: it treats every pairwise swap
equally, which is the wrong question for a top-k ranking. Studio uses
overlap@depth, RBO (persistence 0.9), and a bump chart instead.

## Golden sets and localStorage

Sets live in the browser next to saved connections
(`src/lib/aspected/golden.ts`), keyed per index. Export writes JSON without
local ids or timestamps so the same file can sit in a repo and import into
several browsers. Import regenerates ids.

Empty set names are allowed in storage; the UI shows **Untitled set** via
`goldenSetDisplayName`. Renames commit on blur or Enter, not every keystroke.

## Scorecard runner

`src/hooks/use-scorecard.ts` runs cases with a concurrency limit, progress, a
`runId` guard against stale completions, and a signature cache so unchanged
cases skip a refetch. Signatures include weights because weights change which
documents come back.

After a run, `scoreSet` can grade **as returned** (Scorecard page default) or
**at candidate weights** via `rerank` (Playground tab and weight previews).

The weight sweep samples the log-scale slider, re-grades the whole set locally
at each point, and plots nDCG plus a rank-vs-weight chart for tracked case ids.
`pickSweepPeak` prefers an interior sample near the absolute max; edge peaks
surface as **Use peak (edge)** so chaining rail maxima is not mistaken for
optimize. **Quick suggest (preview)** (`auto-tune.ts`) runs coordinate ascent on
the cached rows (Preview nDCG only). **Verify with Run set** re-fetches at the
candidate weights and grades Live (server order) before Keep or Revert. All
sweep and Preview ascent arithmetic is on cached rows, not a search per sample.

**Auto-tune** (`/indexes/:name/auto-tune`) is the Live path: a budgeted planner
(`tuner.ts`) proposes configs; `use-auto-tune.ts` evaluates them with real
`searchIndex` calls, a global case-signature cache, AbortSignal cancel, optional
holdout (Confirm may pick among train near-ties by holdout gap), and saved tuned
configs in localStorage. Preview Suggest remains a diagnostic; Auto-tune is what
you use when the objective must match the server.

## Request Inspector and concurrent runs

Mutating and search calls surface a Request card (method, path, JSON body) with
curl behind a Code sheet.

A scorecard run fires many searches. Overwriting a single `lastRequest` would
lie about which case you are inspecting. `AspectedClient.describeRequest` builds
the recorded payload without sending, so each case keeps an accurate inspector
body while `request` still records the last live call for simpler pages.

## Metrics copy stays next to the maths

Help text for Precision, Recall, MRR, nDCG, MAP, and chips lives in
`src/lib/aspected/relevance.ts` beside the formulas, and the UI reads it from
there. Do not invent a second copy in a component without updating that module.

## Persistence boundaries

| Data                | Where                      | Survives refresh              |
| ------------------- | -------------------------- | ----------------------------- |
| Connections         | localStorage               | Yes (does not auto-reconnect) |
| Golden sets         | localStorage               | Yes                           |
| Tuned configs       | localStorage               | Yes                           |
| Playground pin A    | React state                | No                            |
| Scorecard run cache | React state (hook)         | No                            |
| Auto-tune run state | React state (hook)         | No                            |
| Theme / settings    | As implemented in Settings | See settings code             |

## Related pages

- Feature detail: [Playground](playground.md), [Scorecard](scorecard.md),
  [Auto-tune](auto-tune.md)
- Demo of these limits:
  [Catalog scorecard](tutorials/05-catalog-scorecard-demo.md)
