# Tutorial 5: Catalog scorecard

**Time:** about 40–50 minutes\
**Goal:** Import a golden set, read the quality metrics, fix amber and red cases
with weights, then use the Playground Scorecard tab to tune weights with live
deltas and a weight sweep.

**Prerequisites:** [Tutorial 1](01-connect-and-seed.md) (`catalog` seeded).
[Tutorials 3–4](README.md) recommended, especially Compare metrics in
[Tutorial 4](04-playground.md).

You will move between two related screens:

| Screen                                            | Job                                                    |
| ------------------------------------------------- | ------------------------------------------------------ |
| **Scorecard page** (`/indexes/catalog/scorecard`) | Create, import, edit, and grade golden sets            |
| **Playground → Scorecard tab**                    | Tune the same set against the left-hand weight sliders |

The Scorecard page owns the set. The Playground tab is where you search for
better weights.

---

## Why a golden set

A single Playground query only tells you what happened for that query. A golden
set is a list of intents you care about, each with documents that should return
(and optionally documents that must not). Studio runs every case and reports
Precision, Recall, MRR, nDCG, and MAP, plus a green / amber / red chip per case.

Compare (Tutorial 4) answers “did the list shuffle?” Scorecard answers “did
quality improve?”

---

## Reading Scorecard metrics

Read this once before the first **Run set**, then use it as a cheat sheet while
you tune. The same wording lives behind each tile’s help icon (`METRIC_HELP` in
`src/lib/aspected/relevance.ts`).

Studio reports **macro means**: each case contributes equally. One hard intent
cannot be drowned out by a dozen easy ones.

### Chips (green / amber / red)

Each case is graded on the set’s **primary metric** (Catalog baseline uses
**nDCG**) against its green and amber thresholds (here `0.8` and `0.5`).

| Chip  | Meaning                                                           |
| ----- | ----------------------------------------------------------------- |
| Green | Primary metric ≥ green threshold                                  |
| Amber | ≥ amber threshold but below green (often “right docs, bad order”) |
| Red   | Below amber, **or** any **forbidden** document in the top `k`     |

Forbidden always forces red. A policy miss is not a quality target you can
average away.

**While optimizing:** Fix reds that are policy first (wrong family in the
window). Then chase amber (order). Leave greens alone unless a weight change
that helps one case hurts many others (watch the summary tiles).

### Precision@k

**Question:** Of the top `k` slots, how many did we want?

Computed as hits ÷ `min(k, results returned)`. A short index is not marked down
for empty slots it never had.

| Pattern                     | Likely story                                     |
| --------------------------- | ------------------------------------------------ |
| High Precision, high Recall | Page is on-target and complete enough            |
| High Precision, low Recall  | Clean page, incomplete. Raise `k` or unbury hits |
| Low Precision, high Recall  | Hits are present but buried in noise             |
| Both low                    | Wrong neighbourhood or weak judgements           |

Precision alone does **not** care about order inside the hits. Two relevant docs
at ranks 4–5 score the same Precision as ranks 1–2.

### Recall@k

**Question:** Of the documents we wanted, how many made the top `k`?

| Pattern              | What to try                                               |
| -------------------- | --------------------------------------------------------- |
| Recall stuck below 1 | Expected id never entered the window: raise `k`,          |
|                      | change weights and **Run set** again (Preview             |
|                      | cannot invent new docs)                                   |
| Recall 1, nDCG soft  | Everything is on the page; fix **order** (weights, gains) |

### MRR (mean reciprocal rank)

**Question:** How early is the **first** good hit, on average?

Per case: `1 / rank_of_first_expected`, then average over cases. `1.000` means
every case leads with a relevant document. `0.500` means the first hit typically
sits second.

**Trap:** MRR can be `1.0` while nDCG is not. Every case can lead with _a_
relevant document while the _best_ relevant document (higher gain) sits second.
MRR does not see graded preference. Use it as a “did we lead with something
usable?” check, not as your only order metric.

### nDCG@k (normalized discounted cumulative gain)

**Question:** How good is the **order**, given graded relevance?

Each hit contributes `gain / log2(rank + 1)`. Rank 1 is worth far more than rank
10. The score is divided by the ideal ordering at this `k`, so a perfect ranking
is exactly `1`.

**Gains** are how you express preference: leave `1` for plain relevant; raise
gain when a document should outrank other hits. That is the only part of nDCG a
yes/no judgement cannot express.

| nDCG story                           | Typical fix                                                             |
| ------------------------------------ | ----------------------------------------------------------------------- |
| High Recall, nDCG just under green   | Reorder with weights (often Preview is enough)                          |
| nDCG drops when you boost one aspect | That aspect helps some cases and hurts others; use the **weight sweep** |
| nDCG 1.0 on easy cases only          | Your set is soft; add hard intents                                      |

Catalog baseline uses nDCG as primary because its amber case is an **order**
problem between two known gaming laptops.

### MAP (mean average precision)

**Question:** Are hits early, not merely present?

Per case, precision is measured at every rank that holds a relevant document and
averaged; then those averages are averaged over cases. Unlike Precision@k, MAP
rewards putting hits early.

Use MAP when you care about “push all relevants up” without graded gains. Prefer
nDCG when some relevants must outrank others (gains matter).

### Which metric should be primary?

| Primary   | Choose when…                                                      |
| --------- | ----------------------------------------------------------------- |
| **nDCG**  | Order and graded preference matter (default for Catalog baseline) |
| Precision | You care that the page is clean, less about which hit is first    |
| Recall    | Missing an expected doc is worse than a noisy slot                |
| MRR       | “First answer usable?” dominates (chat / single-shot UX)          |

Thresholds are yours. Green `0.8` / amber `0.5` on nDCG is a teaching default,
not a universal SLA.

### Preview grades vs Run set

| Mode        | Metrics can…                                       | Metrics cannot…                                                          |
| ----------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| **Preview** | Reorder the fetched top `k`, change nDCG / MRR / … | Pull in missing expected docs; eject forbidden that is already in-window |
| **Run set** | Fetch a new neighbourhood under new weights        | Guess what you meant without judgements                                  |

After any low-Overlap Compare change (Tutorial 4), prefer **Run set** before
trusting the scorecard numbers.

Full definitions: [Scorecard](../scorecard.md).

---

## Part 0: Confirm the stage

1. Studio is connected ([Tutorial 1](01-connect-and-seed.md))
2. Index **catalog** exists with 100 documents
3. Sidebar shows **Schema**, **Documents**, **Search**, **Playground**,
   **Scorecard**

If `catalog` is missing:

```bash
deno task seed:catalog
```

Then refresh Indexes and open **catalog**.

---

## Part 1: Open the Scorecard page

### Step 1: Go to Scorecard

1. Sidebar under **catalog** → **Scorecard**\
   (URL: `/indexes/catalog/scorecard`)
2. Read the page intro

This page **owns** golden sets (create, edit, import, export, delete). The
Playground Scorecard **tab** only grades a set you already have. You cannot
import from the Playground tab.

### Step 2: Import Catalog baseline

1. Click **Import** or **Import one**
2. Choose `utility/catalog-golden-set.json` from this repo (or paste its JSON)
3. Click **Import**

Expect:

- Toast: imported **Catalog baseline** (10 cases ready to run)
- Dropdown and name field show **Catalog baseline**
- Default **k** is `5`
- Primary metric **nDCG**, green `0.8`, amber `0.5`

Import regenerates local ids so the same repo file can live in many browsers
without colliding.

### Step 3: Glance at the cases (optional)

After a run you will see ten names such as **Gaming laptop around 900** and
**Student laptop under 600**. No edits yet.

---

## Part 2: First run at equal weights

### Step 4: Leave weights at 1

On the Scorecard page left column, leave every aspect at **1** (slider midpoint
on the log scale).

Equal weights are the honest baseline. This set is built so eight cases are
already green here; two are not. That gives you something to fix without
starting from a blank scoreboard.

### Step 5: Click Run set

1. Click **Run set**
2. Wait until tiles and chips fill in

Expect approximately (Cosine can nudge the tiles a little between runs; chips
matter more than the third decimal):

| Metric      | Value      | How to read it here                          |
| ----------- | ---------- | -------------------------------------------- |
| nDCG@5      | ~0.95      | Strong overall order; two cases still soft   |
| Precision@5 | ~0.46–0.48 | Many top-5 slots are unjudged / not expected |
| Recall@5    | ~0.95      | Almost every expected doc is on the page     |
| MRR         | ~1.000     | Every case’s **first** hit is relevant       |
| MAP         | ~0.93–0.95 | Hits tend to sit early                       |

Hover each tile’s help icon once. Notice Precision can look “low” while Recall
and MRR look great: with `k=5` and only a few expected ids per case, unused
slots are normal. The first hit is still good and most expected docs are
present. **nDCG** is the right primary for “is order good enough?”

Chips: **8 green, 1 amber, 1 red**.

### Step 6: Open the Request Inspector for one case

1. Select a case chip
2. Confirm `POST /indexes/catalog/search` with that case’s `query`, `k`,
   `weights`, and `withExplanation: true`

Scorecard fires one search per enabled case. The inspector follows the case you
have selected.

---

## Part 3: The amber case (order is wrong)

### Step 7: Click the amber chip

Open **Gaming laptop around 900**.

- Query: title `gaming laptop`, category `laptop`, price `900`
- Expected: `laptop-quanta-play-15` (gain **3**), `laptop-nimbus-play-15` (gain
  **1**)
- Ranking: the **1499** gaming laptop is above the **899** one
- nDCG near **0.797**, just under green **0.8**

Recall is fine (both expected docs in the top five). Order is not: the higher
gain should lead. Weights can fix order without rewriting the query.

**Interpret:** Amber + high Recall → Preview-friendly. You do not need a new
neighbourhood yet.

---

## Part 4: The red case (policy is wrong)

### Step 8: Click the red chip

Open **Student laptop under 600**.

- Expected: `laptop-vertex-book-14` (gain 3), `laptop-quanta-value-15` (gain 2)
- **Forbidden:** `printer-nimbus-inkjet`
- Ranking: a **printer** appears in the top five

Enums **steer**; they do not hard-filter. “Homework” in a title can still pull a
home inkjet when `category` is only weight 1. Forbidden forces **red** even if
MRR looks fine.

**Interpret:** Red from forbidden → need a **Run set** after raising the
steering aspect. Preview cannot eject that printer if it is already in the
window.

---

## Part 5: Fix order in Preview

### Step 9: Raise the price weight

1. Drag **price** to about **8**
2. Do **not** click Run set yet

Expect:

- **Preview** badge
- Gaming case → **green** (nDCG ~0.96)
- Summary ~0.963 with **9 green, 0 amber, 1 red**
- Student case still **red**

You improved order for docs already fetched. Policy red remains until a real
re-run.

---

## Part 6: Fix policy with a real Run set

### Step 10: Raise category and run again

1. Drag **category** to about **6** (keep price ~8)
2. Click **Run set**
3. Wait for Live grades

Expect: printer gone, **10 green**, nDCG ≈ **0.994**.

That is the neighbourhood change Preview cannot invent. On Compare (Tutorial 4)
you would also have seen Overlap drop and documents enter/leave.

---

## Part 7: Label a result where you are looking

### Step 11: Mark relevant

1. Select **Phone camera for low light**
2. Find an unjudged id such as `phone-aurora-one`
3. Click **Mark relevant**
4. Optionally raise **gain** above 1 if it should outrank other hits

Labelling in context beats a separate spreadsheet. Gains are how nDCG learns
preference. Remove the judgement in the editor if you do not want to keep it.

---

## Part 8: Golden set management (optional)

Useful once you maintain your own sets. Safe to skip on a first pass.

### Step 12: New set

1. **New** → toast **Golden set created**
2. Name field empty with placeholder **Untitled set**, focused
3. Type a name, blur (or press Enter) to persist

### Step 13: Duplicate

1. Select **Catalog baseline**, run once
2. **Duplicate** → **Catalog baseline copy**, status **Not run yet** (run cache
   cleared)

### Step 14: Delete with confirm

1. **Delete** on a set you do not need
2. Confirm dialog names the set; Cancel once, then Delete

Same pattern for **Delete case**.

---

## Part 9: Playground Scorecard (tune weights live)

You already graded and fixed the set on the Scorecard **page**. Now switch to
the Playground **Scorecard tab**. Same golden set. Different job: try weights
quickly, see quality move, and find a peak without hand-dragging forever.

### How the Playground Scorecard differs from the Scorecard page

|                                 | Scorecard **page**     | Playground **Scorecard tab**                            |
| ------------------------------- | ---------------------- | ------------------------------------------------------- |
| Create / import / edit cases    | Yes                    | No (link out only)                                      |
| Weight sliders                  | Own column on the page | Shared left panel (also drives Ranking and Compare)     |
| **Run set**                     | Searches each case     | Same: searches each case once, then caches rows         |
| After a weight drag             | Preview re-grade       | Preview re-grade, optional **deltas** vs pinned A       |
| Weight sweep + rank vs weight   | Not on this page       | nDCG vs one aspect; rank vs weight; edge-aware Use best |
| Suggest weights / Quick suggest | Not on this page       | Cache ascent → Verify; prefer Auto-tune for Live        |
| Auto-tune                       | Dedicated page         | Budgeted Live weights, on/off, depth                    |

Critical mental model: the left-hand sliders are the config under test for
**Ranking**, **Compare**, and **Scorecard**. There is no hidden second weight
panel on the Scorecard tab.

Also: **Run set** on the Scorecard tab is not the same as **Run search** on
Ranking. Ranking searches one playground query. Scorecard searches every golden
case.

### Step 15: Open Playground and compose a baseline query

Pinning A needs a real Ranking search first. An empty Playground cannot run.

1. Sidebar under **catalog** → **Playground**\
   (`/indexes/catalog/playground`)
2. On the left, set every weight slider back to **1** (midpoint)
3. Turn **Auto-run** off for this step if you want full control (optional)
4. Fill a sparse query (same shape as Tutorial 3 / 4). Enable only these:

| Aspect     | Enabled | Value           |
| ---------- | ------- | --------------- |
| `title`    | on      | `gaming laptop` |
| `category` | on      | `laptop`        |
| `price`    | on      | `900`           |
| `brand`    | off     | (leave blank)   |
| `rating`   | off     | (leave blank)   |
| `released` | off     | (leave blank)   |

5. Set **k** to `10` or `20`
6. Click **Run search** (or let Auto-run fire)
7. Confirm Ranking shows **Live** and a result list

You need this Live search so Compare can pin something concrete. The golden set
cases bring their own queries later; this Ranking query is only the A/B baseline
for deltas and for any Ranking / Compare exploration you do in parallel.

### Step 16: Pin config A for deltas

1. Open the **Compare** tab
2. Click **Pin current as A**
3. Expect Overlap ~100%, RBO ~1, and no movement (A and B match right after pin)

Pin freezes form values, result rows, and weights from that Live search.

What pin gives the Scorecard tab:

- Metric tiles can show a **delta** vs A’s weights (for example nDCG +0.019)
- Without a pin, chips and the sweep still work; you just lose the “vs baseline”
  numbers

What pin does **not** do:

- It does not run the golden set
- It does not change Scorecard judgements
- Ranking’s **Move** column is separate (it freezes on Live → Preview for the
  Ranking table, not from this pin)

If **Pin current as A** is disabled, Ranking never got a successful search.
Return to Step 15.

### Step 17: Open the Scorecard tab and select the set

1. Open the **Scorecard** tab (Ranking | Compare | **Scorecard**)
2. In the golden set dropdown, select **Catalog baseline**
3. If the list is empty: the set lives in this browser’s `localStorage`. Click
   back to the Scorecard **page**, confirm **Catalog baseline** is there, return
   to Playground, or refocus the window (the tab reloads sets on focus)

You should see empty or stale grade UI until you run the set from this tab. A
run on the Scorecard page does not automatically fill this tab’s cache.

### Step 18: Run set at equal weights (Playground)

1. Confirm left-hand weights are still all **1**
2. Click **Run set** on the Scorecard tab
3. Wait for tiles and chips

Expect the same teaching board as Part 2: about **8 green / 1 amber / 1 red**,
nDCG ≈ **0.95**.

If A was pinned at all-`1`, deltas should be near **0** (current weights ≈ A).

Select the amber chip (**Gaming laptop around 900**) and the red chip (**Student
laptop under 600**) once so you recognize them here too.

### Step 19: Raise price and read Preview + deltas

1. Stay on the Scorecard tab
2. On the **left** panel, drag **price** to about **8**
3. Do **not** click Run set yet

Expect:

| Signal               | What you should see                                            |
| -------------------- | -------------------------------------------------------------- |
| Badge                | **Preview** (local re-grade of cached case rows)               |
| Amber gaming case    | Turns **green**                                                |
| Red student case     | Stays **red** (forbidden printer still in-window)              |
| Summary              | Toward ~0.963, **9 green / 0 amber / 1 red**                   |
| Deltas (if A pinned) | **Positive** on nDCG (and usually MAP); quality up vs baseline |

Optional cross-check:

1. Open **Compare**: Overlap stays high if the neighbourhood is stable; RBO
   drops if order changed
2. Open **Ranking**: same left-hand weights; **Move** may show arrows vs the
   pre-tweak Ranking baseline

Scorecard answered “is quality better?” Compare answered “how violently did the
list shuffle?” Ranking showed one query’s movement. You did not need ten new
case searches for the Preview grades.

### Step 20: Read the weight sweep and rank vs weight

The sweep answers: for **one** aspect, holding the others fixed, where does set
nDCG peak? It is conditional on the other sliders. Chaining **Use best** across
aspects is not multi-aspect optimize.

1. Still on the Scorecard tab, find **Weight sweep**
2. **Sweep aspect** defaults to the first schema aspect (`title`). Leave it on
   `title`, or choose **price**
3. Read the nDCG chart: horizontal = weight, vertical = nDCG for the whole set.
   The peak is marked on the curve
4. After an all-`1` **Run set**, typical shape for `title`:
   - Peak around weights **0.6–2.5**
   - Over-weight past ~**3.6** and nDCG falls toward ~0.95
5. Read **Rank vs weight** under the nDCG chart: expected (and forbidden) ids
   for the selected case (or the first enabled case) vs weight. Rank 1 is at the
   top
6. If the button says **Use best (… · nDCG …)**, the peak is interior. Click it
   only when you want that single-axis write
7. If it says **Use peak (edge …)**, the max sits on a slider rail. Prefer
   **Quick suggest** / **Auto-tune** or a manual drag; edge peaks are often
   Preview artifacts
8. Confirm the left-hand slider for that aspect jumps when you apply a peak
9. Scorecard Preview updates immediately (cached rows)

How to interpret the curve:

| Curve shape                   | Meaning                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Flat                          | That aspect barely moves this set at current other weights                           |
| Clear interior peak           | A useful band; prefer that over maxing the slider                                    |
| Peak then long decline        | More is worse; common for text when it drowns price / category                       |
| Peak only at 0.01 or 100      | Edge peak: often a Preview artifact; do not chain these as an optimizer              |
| Peak only after Preview fixes | Sweep still cannot eject forbidden docs; clear reds with **Run set** first if needed |

The sweep is arithmetic over rows already fetched. It is **not** one search per
sample. If a document would only enter under a different neighbourhood, the
curve cannot see it until you **Run set** again.

### Step 21: Quick suggest, then prefer Auto-tune

**Quick suggest (preview)** is a cache-only multi-aspect starting point. For the
real Live optimizer, open [Auto-tune](06-auto-tune.md) (Tutorial 6).

If you still want the Preview path here:

1. After a completed **Run set**, click **Quick suggest**
2. Read the card: Preview nDCG start → suggested, and any per-aspect deltas
3. If it warns about an edge peak, treat the suggestion as provisional
4. Click **Apply preview** to write the candidate onto the left-hand sliders
   (Preview grades update from cache)
5. Click **Verify with Run set** so the server re-fetches at those weights
6. Read **Live after verify** nDCG vs the start snapshot
7. **Keep** if Live held or improved; **Revert** if Live dropped and you do not
   accept the trade-off

Quick suggest is cache-only coordinate ascent (Preview nDCG). Verify is the real
gate on this tab. Cosine Preview can disagree with Live server order. When you
want weights, on/off, and depth searched against the server under a budget, use
**Auto-tune** instead.

### Step 22: Clear the red case from Playground

Preview left the student case red. Finish the same fix as Part 6, driven from
here:

1. Raise **category** to about **6** (keep **price** elevated, ~8)
2. Click **Run set** on the Scorecard tab again
3. Wait for **Live** grades
4. Expect **10 green**, nDCG ≈ **0.994**
5. If A is still the all-`1` pin, deltas should be strongly positive

Optional: open Compare after the re-run. Overlap may drop and documents may
enter/leave; that matches “new neighbourhood,” not just re-sort.

### Step 23: Optional second pin (new baseline)

When you are happy with a weight mix:

1. Reset or keep Ranking’s query as you like; **Run search** so Ranking is Live
   at the tuned weights
2. Compare → **Re-pin current as A**
3. Scorecard deltas now measure further tweaks against this better baseline

Use this when the all-`1` pin is no longer the comparison you care about.

---

## Part 10: What to remember

1. Golden sets live in the browser; **Export** writes repo-friendly JSON
2. Scorecard **page** authors the set; Playground **tab** optimizes weights
3. Preview reorders the fetched window; **Run set** fetches a new one
4. Compare measures shuffle; Scorecard measures quality
5. Pin A if you want deltas; fill a Ranking query before you can pin
6. Single-aspect sweep is conditional; edge **Use peak** is a warning, not a
   one-click optimizer
7. **Quick suggest** → Verify is a Preview path; **Auto-tune** is the Live
   multi-aspect optimizer

---

## A practical optimization loop

Use this on your own indexes after the catalog walkthrough:

1. Author (or import) a golden set that matches real intents and forbidden
   outcomes
2. **Run set** at equal weights; note reds (policy / missing) vs ambers (order)
3. On Playground, fill a representative Ranking query, **Run search**, pin A if
   you want deltas
4. Change one aspect at a time on the shared sliders
5. If Overlap stays high: trust Preview grades; chase nDCG / primary metric
6. If Overlap drops or forbidden enters: **Run set** again before deciding
7. Use the sweep as a one-axis diagnostic (rank vs weight + interior peak).
   Prefer **Auto-tune** for Live search, or **Quick suggest** then **Verify with
   Run set**, then **Keep** or **Revert**
8. Export the set and record the final weights next to it in your repo

---

## Expected numbers cheat sheet

Small Cosine Preview differences can appear; chip colours are what matter.

### Run set at all weights 1

| Case                                    | Chip  | nDCG (approx.) | Why                                    |
| --------------------------------------- | ----- | -------------- | -------------------------------------- |
| Gaming laptop around 900                | amber | 0.80           | Wrong order between two gaming laptops |
| Student laptop under 600                | red   | 0.70           | Forbidden printer in top 5             |
| Noise cancelling headphones for flights | green | 1.00           | Sanity check; if this fails, stop      |
| 4K monitor for design work              | green | 1.00           |                                        |
| Compact mechanical keyboard             | green | 1.00           |                                        |
| Cheap tablet for children               | green | 1.00           |                                        |
| Phone camera for low light              | green | 0.94           | Unjudged phone at rank 2 is fine       |
| Mirrorless camera for portraits         | green | 1.00           |                                        |
| Small wireless mouse for travel         | green | 1.00           |                                        |
| Portable bluetooth speaker              | green | 1.00           |                                        |

Summary: nDCG ≈ 0.95 · 8 green · 1 amber · 1 red

### Preview: price ~8 (no re-run)

| Change         | Result                   |
| -------------- | ------------------------ |
| Gaming laptop  | green (~0.96)            |
| Student laptop | still red                |
| Summary        | nDCG ≈ 0.963 · 9 / 0 / 1 |

### Re-run: category ~6 and price ~8

| Change         | Result                      |
| -------------- | --------------------------- |
| Student laptop | green                       |
| Summary        | nDCG ≈ 0.994 · **10 green** |

### Sweep peaks (after run at all 1)

| Aspect   | Peak weight (approx.) | Peak nDCG | Note                                      |
| -------- | --------------------- | --------- | ----------------------------------------- |
| price    | 0.3–1.2               | ~0.970    | Very high price flattens near 0.963       |
| title    | 0.6–2.5               | ~0.970    | Above ~3.6 falls toward ~0.95             |
| category | ≥ ~0.6                | ~0.970    | Clearing the printer still needs a re-run |

---

## The ten cases (reference)

| #  | Case                                    | Query (enabled)                    | Expected (gain)                                       | Forbidden             |
| -- | --------------------------------------- | ---------------------------------- | ----------------------------------------------------- | --------------------- |
| 1  | Gaming laptop around 900                | title, category=laptop, price=900  | quanta-play-15 (3), nimbus-play-15 (1)                |                       |
| 2  | Student laptop under 600                | title, category=laptop, price=600  | vertex-book-14 (3), quanta-value-15 (2)               | printer-nimbus-inkjet |
| 3  | Noise cancelling headphones for flights | title, category=headphones         | quiet-pro (3), quiet (2), quiet-air (1), buds-pro (1) |                       |
| 4  | 4K monitor for design work              | title, category=monitor            | lumen-4k-27 (3), lumen-5k-27 (2), lumen-4k-32 (2)     |                       |
| 5  | Compact mechanical keyboard             | title, category=keyboard           | mech-tkl (3), mech-60 (3), mech-full (1)              |                       |
| 6  | Cheap tablet for children               | title, category=tablet, price=150  | kids-8 (3), tab-10 (2)                                |                       |
| 7  | Phone camera for low light              | title, category=phone, rating=4.8  | shot-pro (3), one-pro (2)                             |                       |
| 8  | Mirrorless camera for portraits         | title, category=camera, price=1400 | lumen-r5 (3), lumen-r7 (1)                            |                       |
| 9  | Small wireless mouse for travel         | title, category=mouse              | aurora-travel (3), travel-fold (2)                    |                       |
| 10 | Portable bluetooth speaker              | title, category=speaker            | aurora-move (3), quanta-mini (1)                      |                       |

Full ids match the seed (`laptop-quanta-play-15`, …).

---

## Troubleshooting

| Symptom                            | Likely cause                        | Fix                                                  |
| ---------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| Playground **Run search** disabled | No aspect has a value               | Enable aspects and fill values (Step 15)             |
| Pin disabled                       | No Live Ranking search yet          | Fill query, **Run search**, then pin                 |
| Playground Scorecard empty         | Set not in this browser / tab stale | Import on Scorecard page; refocus window             |
| Deltas missing                     | Nothing pinned as A                 | Compare → Pin current as A at baseline weights       |
| Red chip won’t clear in Preview    | Forbidden doc still in window       | Change weights, **Run set** again                    |
| Headphones case not green          | Bad seed / wrong index              | Re-run `deno task seed:catalog`                      |
| Dropdown shows Untitled set        | New set with empty name             | Expected; name it on blur                            |
| Import fails                       | Wrong JSON / version                | Use `utility/catalog-golden-set.json` from this repo |

---

## Files

| Path                              | Role                                             |
| --------------------------------- | ------------------------------------------------ |
| `utility/seed-catalog.ts`         | Builds `catalog`                                 |
| `utility/catalog-golden-set.json` | This tutorial’s golden set                       |
| `deno task seed:catalog`          | Runs the seed (`ASPECTED_URL`, `ASPECTED_TOKEN`) |

## Related tutorials

1. [Connect and seed](01-connect-and-seed.md)
2. [Indexes and documents](02-indexes-and-documents.md)
3. [Search](03-search.md)
4. [Playground](04-playground.md) (Compare metrics)
5. This page
