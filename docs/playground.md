# Playground

`/indexes/:name/playground` answers: **what happens to my ranking if I turn this
aspect up?** The [Search](indexes.md#search) page stays the raw API form.

Compose a sparse query with one control per aspect, then drag the log-scale
weight sliders. Every search runs with `withExplanation: true`, so Studio can
recover per-aspect distances and re-score results already on screen. Ranking
updates on the frame without a server round trip and without re-embedding the
query text. A real search follows on a 300ms debounce while **Auto-run** is on.

## Ranking tab

| Badge   | Meaning                                                          |
| ------- | ---------------------------------------------------------------- |
| Live    | Distances the server returned                                    |
| Preview | Re-scored locally at weights the server has not been asked about |
| Stale   | The query changed, or grades cannot be recovered                 |

Every metric stacks per-aspect contributions that sum to the total distance, so
a shorter bar is always a closer match. Select a ranking row to open the aspect
contribution table. Click a truncated **Stored value** cell to open an inspect
sheet with the full JSON.

### Limits

1. Only the `k` documents already fetched are re-scored. A document that would
   enter under new weights cannot appear until the real search lands.
2. An aspect sent at weight `0` gets no distance back, so raising it again marks
   the preview stale rather than guessing.
3. Cosine uses a weighted mean of aspect distances; see
   [Architecture](architecture.md#cosine-is-a-weighted-mean-of-aspects).

Weight sliders span roughly `0.01` to `100` on a log scale
(`src/lib/aspected/playground.ts`), midpoint `1`.

## Compare tab (A/B)

Pin the last real search as config **A**, then keep tweaking into **B**. B is
whatever Ranking already shows, including local weight previews: there is no
second request path.

- **Pin current as A** freezes form values, result rows, and weights
- **Restore A** writes those values back onto the form
- **Clear** drops the pin

| View                          | What it answers                                                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overlap@depth                 | How many of the shared top-`depth` documents appear in both lists (`depth` is `min(k_A, k_B)`)                                                                                                                                    |
| RBO (p 0.9)                   | Rank-biased overlap. Persistence `p` controls how quickly weight falls off down the list; at `0.9`, roughly the top ten ranks dominate. A swap at rank 1 hurts more than a swap at rank 40. Identical prefixes score exactly `1`. |
| Bump chart and movement table | A’s ids on the left, B’s on the right, lines for the same document. Entered and dropped docs show as a single dot on their own side.                                                                                              |

Kendall tau is not used: equal weight on every pairwise swap is the wrong
question for a top-k ranking.

How to read Overlap vs RBO, movement, and when to open Scorecard:
[Reading Compare metrics](tutorials/04-playground.md#reading-compare-metrics).

Pinned weights also feed deltas on the Scorecard tab. See
[Architecture: Compare vs Scorecard](architecture.md#compare-vs-scorecard).

## Scorecard tab

Grades a golden set at the **same** weight sliders as Ranking. Run the set once,
then every weight change re-grades locally and can show a delta against pinned
A. The weight sweep charts nDCG across the slider for one aspect; **Rank vs
weight** shows how tracked case ids move; **Use best** / **Use peak (edge)**
writes a single-axis peak (edge peaks warn). **Quick suggest (preview)** runs
client-side coordinate ascent on the cache, then **Verify with Run set** before
Keep or Revert. For Live multi-aspect search (weights, on/off, depth), open
[Auto-tune](auto-tune.md).

Sets are created and edited on the Scorecard **page**. This tab only selects and
grades them. Full detail: [Scorecard](scorecard.md). Demo talk track:
[Catalog scorecard](tutorials/05-catalog-scorecard-demo.md).

## Related

- Design rationale: [Architecture](architecture.md)
- Golden sets and metrics: [Scorecard](scorecard.md)
- Live optimizer: [Auto-tune](auto-tune.md)
