# Tutorial 4: Playground

**Time:** about 25 minutes\
**Goal:** Drive Ranking (Live / Preview), pin Compare A/B, and learn how to
**read** Overlap, RBO, and movement so you know when a weight change actually
mattered.

**Prerequisites:** [Tutorial 1](01-connect-and-seed.md).
[Tutorial 3](03-search.md) helps. Quality grades (nDCG and friends) are
[Tutorial 5](05-catalog-scorecard-demo.md).

## Layout

Open `/indexes/catalog/playground`.

- **Left:** aspect on/off, values, and **weight sliders** (log scale,
  midpoint 1)
- **Right:** tabs **Ranking**, **Compare**, **Scorecard**

Those sliders are the config under test for _all three tabs_.

## Part A: Ranking and Preview

### Step 1: Compose a query

1. Turn **Auto-run** on if it is off, or plan to click **Run search**
2. Enable **title**, value: `gaming laptop`
3. Enable **category**, value: `laptop`
4. Enable **price**, value: `900`
5. Leave other aspects off
6. Set **k** to `10` or `20`

Playground always requests `withExplanation: true` so it can re-score when a
weight moves without re-embedding.

### Step 2: Live, then Preview

1. Confirm the ranking badge is **Live** (server distances for the weights you
   last searched with)
2. Drag **price** upward (toward roughly `8`, or until the list clearly moves)
3. Badge should flip to **Preview**: Studio recombined aspect distances in the
   browser. No new embedding yet.
4. Auto-run will follow with a real search after the debounce; turn it off if
   you want to sit in Preview longer

Contribution bars stack per-aspect pieces of total distance. Shorter total =
closer match.

### Step 3: Preview limits (memorize these)

1. Only documents already in the current top `k` can change places. A document
   that would _enter_ under new weights cannot appear until **Run search**.
2. If you searched with an aspect weight at `0`, raising it later may show
   **Stale**: the server never returned a distance for that aspect.

More: [Architecture](../architecture.md),
[Playground reference](../playground.md).

## Part B: Compare A/B

Compare answers a narrow question: **did this weight change shuffle the list,
and where?** It does **not** say whether the shuffle is good. That is Scorecard.

### Step 4: Pin config A

1. Reset weights to all `1`
2. **Run search** so Ranking is Live at all-`1`
3. Open the **Compare** tab
4. Click **Pin current as A**

Pin freezes form values, result rows, and weights from that search. **A** is the
baseline. **B** is whatever Ranking shows now (including Preview).

### Step 5: Change B

1. Raise **price** again (stay on Compare, or tweak on Ranking and return)
2. Read the metric tiles, bump chart, and movement table
3. Then work through the interpretation section below before moving on

### Step 6: Restore and clear

1. **Restore A** puts pinned values back on the form
2. **Clear** drops the pin when you are done

Pinned A also feeds **deltas** on the Scorecard tab later. Pinning is optional
for Ranking, required if you want “vs baseline” quality numbers.

---

## Reading Compare metrics

Use this section whenever you are deciding whether a weight tweak is worth
keeping. Hover each tile’s help icon in the UI for the same definitions Studio
ships in code.

### Overlap@depth

**What it is:** Share of documents that appear in both A’s and B’s top `depth`,
where `depth` is `min(k_A, k_B)`.

**How to read it:**

| Overlap | Typical meaning                                              |
| ------- | ------------------------------------------------------------ |
| ~100%   | Same neighbourhood. Order may still have swapped (check RBO) |
| Mid     | Meaningful reshuffle of who made the page                    |
| Low     | You changed the neighbourhood, not just sort order           |

**When optimizing an index:** High overlap with a big RBO drop means you mostly
reordered the same hits (often what you want after a small weight nudge). Low
overlap means you are changing _which_ documents compete. That can be good
(eject a wrong family) or risky (lose a relevant doc that only lived at rank
`k`). Always follow a low-overlap change with a Scorecard run if you have a
golden set.

### RBO (rank-biased overlap, p = 0.9)

**What it is:** Agreement between two rankings that **weights the top more**.
Persistence `p = 0.9` means roughly the first ~10 ranks dominate the score.
Identical prefixes score exactly `1`.

**How to read it:**

| RBO vs Overlap                   | Interpretation                                     |
| -------------------------------- | -------------------------------------------------- |
| Both high                        | Almost no change. Look elsewhere                   |
| Overlap high, RBO lower          | Same docs, different order (classic weight tuning) |
| Both mid/low                     | Membership and order both moved                    |
| RBO near 1 after a weight change | That aspect barely mattered for this query’s top-k |

A swap at rank 1 hurts RBO far more than a swap at rank 40. That matches how
users and RAG pipelines behave: the first few slots matter.

**Kendall tau is not used.** Equal weight on every pairwise swap answers the
wrong question for top-k search.

### Movement (entered / left / max shift)

**What it is:** How many documents entered or left the compared top-k, and the
largest rank jump among documents present in both lists.

**How to read it:**

- **Entered / left:** neighbourhood change. Pair with Scorecard when a forbidden
  or expected id is involved.
- **Max shift:** how violently order changed for a survivor. A max shift of 1 is
  a gentle nudge; a large shift with high overlap is still “same page, different
  priority.”

### Bump chart and movement table

A’s ids on the left, B’s on the right, lines for the same document. Entered and
dropped docs show as a single dot on their own side.

**How to use it while tuning:**

1. Pin equal weights as A
2. Raise one aspect on B
3. Ask: did the document I care about move **up**, and did anything bad
   **enter**?
4. If yes on both, Compare alone cannot decide. Open Scorecard (or the amber/red
   chips in Tutorial 5)

### Compare vs Scorecard (decision rule)

| You need to know…                         | Use           |
| ----------------------------------------- | ------------- |
| Did the list change, and how violently?   | **Compare**   |
| Is the new list better for my intents?    | **Scorecard** |
| Preview reorder only vs new neighbourhood | Both (limits) |

Formula-level reference: [Playground](../playground.md#compare-tab-ab).

## Part C: Scorecard tab (preview only)

### Step 7: Open the tab without diving yet

1. Open **Scorecard**
2. Empty state points you to create or import a set on
   `/indexes/catalog/scorecard`

Do not invent cases here. Full quality story (nDCG, Precision, Recall, MRR, MAP,
chips, sweep, Quick suggest → Verify):
[Catalog scorecard](05-catalog-scorecard-demo.md). On the Playground Scorecard
tab, **Quick suggest** runs a cache-only ascent; always **Verify with Run set**
before Keep. For Live multi-aspect search, open [Auto-tune](06-auto-tune.md).

## Checkpoint

You can drive Live / Preview, explain the `k` window limit, pin A, and interpret
Overlap, RBO, and movement.

Next: [Catalog scorecard](05-catalog-scorecard-demo.md).
