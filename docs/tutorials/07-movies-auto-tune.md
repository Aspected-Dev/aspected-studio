# Tutorial 7: Movies Auto-tune readiness

**Time:** seed takes tens of minutes on CPU; Scorecard and Auto-tune runs add
more depending on budget.

**You will:** load the TMDB 5000 `movies` index, import the golden sets, grade a
baseline, run planted-truth Auto-tune, then exercise Live Auto-tune on the main
set.

**Prereqs:** a local Aspected server on `http://localhost:8080` (or
`ASPECTED_URL`), Studio connected, and the CSVs in `utility/`:

- `utility/tmdb_5000_movies.csv`
- `utility/tmdb_5000_credits.csv`

Unlicensed servers allow two indexes. Keep `catalog` if you still need it;
`movies` is the second.

## What this index is

About 4,802 films (one row without a release date is dropped) across ten
aspects: `title`, `overview`, `themes`, `credits` (text), `genre`, `language`
(enum), `released` (year datetime), `rating`, `popularity`, `runtime` (number).

Document ids are readable: `slug(title)-year`, for example
`the-dark-knight-2008`. That matches how the golden sets name expected and
forbidden ids.

## Step 1: Seed

```bash
deno task seed:movies
```

Optional smoke run:

```bash
MOVIES_LIMIT=50 deno task seed:movies
```

Re-running deletes and rebuilds `movies`. Four text aspects mean roughly 19k
embeddings; expect minutes to tens of minutes on CPU. When it finishes, open
`/indexes/movies/playground`.

## Step 2: Offline check

```bash
deno task check:movies
```

This loads the CSVs, parses both golden JSON files, and checks that every
expected and forbidden id exists, aspect names and types match the schema, enum
and number values are in range, and datetime queries use a server-accepted year
format (`YYYY`, `YYYY/MM`, or full date-time).

After the index is fully seeded:

```bash
deno task check:movies -- --live
```

Grades both sets at all weights 1 and at `title=4`. Known-item cases should not
be red at baseline; if they are, fix the index before Auto-tune.

## Step 3: Import golden sets

1. Open `/indexes/movies/scorecard`
2. Import `utility/movies-golden-set.json` (Movies baseline, ~86 cases, k=10)
3. Import `utility/movies-planted-set.json` (Movies planted truth, 10 cases)

## Step 4: Baseline

1. Select **Movies baseline**
2. **Run set** at all weights 1
3. Run set again. Note chip counts and nDCG; the small delta is real noise
4. Confirm known-item tagged cases are green

## Step 5: Planted-truth Auto-tune

Planted truth is a **smoke oracle**, not a quality baseline. Each of the 10
cases has one primary lever (title, credits, overview, genre+themes,
language+text, rating, or themes). Soft enum/datetime-only cases that stayed at
0.000 even at high weight (for example Western-only Django, year-only 1994,
short runtime) were dropped: those aspects steer rather than hard-filter, and
Django’s primary genre is Drama, so Western alone never recovers it.

1. Open `/indexes/movies/auto-tune`
2. Select **Movies planted truth**
3. Budget **Standard**, **holdout off** (tiny set; `Date.now()` holdout splits
   make two Thorough runs tell different stories)
4. **Start auto-tune**

**Pass bar** (do not require global title/credits/overview weight increases):

- Objective rises above noise versus all-weights-1
- No planted case stuck at 0.000 at baseline
- Smoke Dark Knight stays high (~0.9+)
- Spielberg SF, toys overview, rating 8.5 drama, Documentary food, and French
  Amélie improve or stay strong when their levers are weighted
- Themes YA dystopia stays mid-band rather than collapsing if themes is demoted

Manual lever spot-checks at all-weights-1 (after the hardened rewrite): smoke,
Documentary food, and French Amélie already sit at ~0.9–1.0; rating 8.5 drama
and Japanese fantasy clearly rise when `rating` / `language` are weighted up;
Spielberg, Nolan, toys, and YA themes stay mid-band (non-zero), which is enough
for the smoke oracle.

If the objective barely moves, or several cases go to zero, stop and treat that
as a tuner bug before trusting the main set. Main baseline still uses holdout.

## Step 6: Main-set Auto-tune

On **Movies baseline**:

1. **Quick** (250): sanity that the run starts, caches, and stops cleanly
2. **Standard** (1000): read champion vs baseline, holdout, per-case deltas by
   tag (`policy`, `known-item`, `people`, …). No slice should silently collapse
3. **Thorough** (4000): champion should agree with Standard within the noise
   floor

Repeat Standard once. Objective should reproduce within noise.

## Step 7: Round trip

1. Playground → Scorecard tab → **Load tuned config**
2. **Run set** Live
3. nDCG and chips should match the Auto-tune champion for that set

## Step 8: Operational checks

- Searches used stay at or below the budget plus one trial; cache hits > 0
- **Stop** mid-run keeps best-so-far and saves it
- Concurrency 4 vs 8: higher concurrency should not change the champion beyond
  noise; watch server load
- If the server dies mid-run, failed cases score 0 and must not crown a broken
  config as a win

## Step 9: UI at scale

With ~86 cases, skim Progress, Results, per-case deltas, and the leaderboard for
layout or render issues.

## Findings

Record tuner bugs, UI issues, and judgement gaps as follow-ups. Do not widen
this dataset change to fix unrelated product work unless a blocker appears.

## Findings from the first live baseline

Recorded after `deno task seed:movies` and `deno task check:movies -- --live` on
a local CPU server (~44 minutes to seed ~4,802 docs).

| Observation                                                                                                               | Implication                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Easy known-items (Inception, Shawshank, Dark Knight, Amélie, Spirited Away, WALL-E) are green at all weights 1            | Index and id slugs are sound                                                                                                         |
| Title collisions (Batman years, Host, Out of the Blue) leave the sibling in the top 10 when year/language are at weight 1 | Soft aspects steer rather than filter; collision cases grade the correct id without forbidden siblings so baseline chips stay honest |
| Host 2006 needs a high `language` weight to beat Host 2013                                                                | Good Auto-tune signal for Screen/weight on language                                                                                  |
| Hardened planted set (10 cases) has no forever-zeros at all weights 1                                                     | Soft-only Western/year/runtime cases were removed; Documentary/French/Japanese now carry a second signal                             |
| Raising `title` alone barely moves macro nDCG on the main set                                                             | Many cases are overview/credits/structured; use Auto-tune multi-aspect, not a single slider                                          |

Manual steps still required for production sign-off: planted Standard Auto-tune
with holdout off (Step 5 pass bar), main-set Quick → Standard → Thorough with
holdout on, stability repeat, Load tuned config round trip, Stop/concurrency
checks, and a browser pass over Progress/Results with 86 cases. Use this
tutorial’s Steps 5–9.

## Related

- [Auto-tune](../auto-tune.md)
- [Scorecard](../scorecard.md)
- Tutorial 6: [Auto-tune the catalog](06-auto-tune.md)
