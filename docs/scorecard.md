# Scorecard and golden sets

`/indexes/:name/scorecard` is where weight tuning stops being a matter of taste.
A **golden set** is a list of cases: each case is a sparse query plus the
documents that should return (and optionally documents that must not). Studio
runs the set against the connected server and reports ranking metrics plus a
green, amber, or red chip per case.

The Playground’s **Scorecard** tab uses the same sets as a live objective
function while you drag weights. See
[Playground: Scorecard tab](playground.md#scorecard-tab).

## Metrics

Every figure carries a help icon. The same copy lives beside the maths in
`src/lib/aspected/relevance.ts`, so the explanation cannot drift from the
formula.

| Metric      | What it answers                                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Precision@k | Share of the top `k` that is in the expected list. Divided by `min(k, results returned)`, so a short index is not marked down for slots it never had. |
| Recall@k    | Share of the expected documents that reached the top `k`. High precision with low recall means the page is clean but incomplete.                      |
| MRR         | Reciprocal rank of the first expected document, averaged over cases. `1.000` means every case leads with a relevant document.                         |
| nDCG@k      | Gain discounted by `log2(rank + 1)`, over the best ordering achievable at this `k`. Ideal order scores exactly `1`.                                   |
| MAP         | Precision measured at every rank holding a hit, averaged. Rewards putting hits early rather than merely on the page.                                  |

All five are **macro means**, so one hard case cannot be drowned out by a dozen
easy ones. Chips grade on whichever metric the set names as primary, against its
own green and amber thresholds. A case that returns a **forbidden** document is
always red, however good its numbers are: a policy rule is not a quality target.

How to interpret patterns while tuning (Precision vs Recall, MRR traps, when
Preview grades lie, primary-metric choice, optimization loop):
[Reading Scorecard metrics](tutorials/05-catalog-scorecard-demo.md#reading-scorecard-metrics)
in the catalog tutorial.

## Judgements and gains

Expected documents carry a **gain**. Leave it at `1` for plain relevant, and
raise it when a document should outrank the other hits. That is the only part of
nDCG that a yes/no judgement cannot express.

Labelling happens where you are already looking. Run a case, then **Mark
relevant** on any unjudged result adds it to the expected list. Expected
documents that did not make the cut are listed beside the ranking.

## Managing sets

- **New** creates an unnamed set (UI shows Untitled set) and focuses the name
  field; a toast confirms creation.
- **Duplicate** copies cases under fresh ids, clears the run cache, and toasts.
- **Delete** set or case asks first (`AlertDialog` destructive), then toasts.
- Name field saves on **blur** or Enter, not every keystroke.
- Sets live in `localStorage`, keyed per index.
- **Export** writes repo-friendly JSON with no local ids or timestamps.
- **Import** accepts a file or pasted text and assigns fresh ids.

Playground Scorecard reloads sets on mount and when the window regains focus, so
a set created on the Scorecard page appears without a full remount.

## Running and previewing

**Run set** searches each enabled case (concurrency-limited, signature-cached).
On the Scorecard page, grades follow server order by default. Changing a weight
after a run can show a **Preview** of local re-rank; a badge marks that state.

Limits:

1. Grading only sees the top `k` a case fetched. A document that would enter
   under different weights cannot appear until the set is run again.
2. A set is only as good as its judgements: an unjudged case scores zero, which
   is the honest answer rather than a flattering one.
3. Preview cannot eject a forbidden document that is already in the window;
   raise weights and **Run set** again to fetch a new neighbourhood.

## Playground Scorecard tab

| Control                     | Role                                                    |
| --------------------------- | ------------------------------------------------------- |
| Weight sliders (left panel) | Config under test for Ranking _and_ this tab            |
| Run set                     | Server fetch; fills the cache used by preview and sweep |
| Pin A (Compare tab)         | Optional baseline for metric deltas                     |
| Weight sweep + Use best     | nDCG vs one aspect’s weight; write peak to the form     |

Create/edit/import stay on the Scorecard page. Deeper demo:
[Catalog scorecard](tutorials/05-catalog-scorecard-demo.md). Pipeline
detail: [Architecture](architecture.md#scorecard-runner).

## Related

- [Playground](playground.md)
- [Architecture](architecture.md)
- Seed + golden JSON: `utility/seed-catalog.ts`,
  `utility/catalog-golden-set.json`
