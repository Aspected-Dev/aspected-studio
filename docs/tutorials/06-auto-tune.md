# Tutorial 6: Auto-tune the catalog

**Time:** about 15–25 minutes (Standard budget; Thorough takes longer)

**You will:** run Live Auto-tune on the catalog golden set, read the champion,
check holdout, and load the saved config in Playground.

**Prereqs:** [Tutorial 1](01-connect-and-seed.md) (seeded `catalog`) and
[Tutorial 5](05-catalog-scorecard-demo.md) through importing **Catalog
baseline**. A completed Scorecard **Run set** is useful context but not required
for Auto-tune itself.

## Step 1: Open Auto-tune

1. Sidebar under **catalog** → **Auto-tune** (`/indexes/catalog/auto-tune`)
2. Confirm **Catalog baseline** is selected as the golden set
3. Read the setup warning: many Live searches; prefer a non-serving connection
   when you can

## Step 2: Choose a budget and start

1. Leave aspect space defaults (tune weight + allow off for aspects the set
   uses)
2. Budget: **Standard** (1000 searches) for this walkthrough
3. Keep **Train / holdout split** on (the catalog set is large enough at 10
   runnable cases, so 7 train and 3 holdout)
4. Click **Start auto-tune**
5. Watch **Progress**: stage badges, searches used, cache hits, trial feed

You can **Stop** at any time. Best-so-far is kept.

Stay on Standard if you want to see the whole tutorial. **Quick** (250) spends
its whole budget inside the Coarse stage on this set, so Refine, Depth, and
Confirm never run. Because the holdout is only scored in Confirm, the Holdout
tile stays `n/a` and Step 3's holdout check has nothing to read.

## Step 3: Read the champion

When the run finishes:

1. **Results** shows start vs champion objective and the noise floor
2. Read **Why this config** (weight changes, offs, depth)
3. Skim **Per-case primary delta**: no single case should silently collapse
4. If holdout lagged the train champion, treat the win as provisional

The champion is **auto-saved** under Saved configs.

## Step 4: Apply in Playground

1. Open **Playground**
2. In **Query and weights**, **Load tuned config** → pick the new champion
3. Confirm the weight sliders match the saved weights
4. Open the Scorecard tab and **Run set** once to grade Live at those weights
5. Compare chips and nDCG to the all-`1` baseline from Tutorial 5

Optional: open Ranking / Compare with a representative query and pin A if you
want deltas while exploring further by hand.

## Step 5: What not to confuse

| Control                        | What it is                                            |
| ------------------------------ | ----------------------------------------------------- |
| **Auto-tune**                  | Live server search under a budget                     |
| **Quick suggest (preview)**    | Cache-only Preview ascent; verify or prefer Auto-tune |
| **Use best** on a weight sweep | One-aspect peak on the cache                          |

## Checkpoint

You can start a budgeted Live run, interpret champion vs holdout, and load a
saved config onto Playground weights.

Reference: [Auto-tune](../auto-tune.md).
