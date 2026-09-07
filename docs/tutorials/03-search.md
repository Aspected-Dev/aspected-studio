# Tutorial 3: Search

**Time:** about 10 minutes\
**Goal:** Run a sparse search on the Search page and see the HTTP request shape.

**Prerequisites:** [Tutorial 1](01-connect-and-seed.md). Tutorial 2 is useful
but not required.

## Search vs Playground vs Scorecard

| Screen         | Job                                                    |
| -------------- | ------------------------------------------------------ |
| **Search**     | Raw API form: exact control over query, weights, flags |
| **Playground** | Tune weights with live preview and Compare             |
| **Scorecard**  | Grade a golden set of expected rankings                |

This tutorial stays on Search. Metric interpretation starts in
[Tutorial 4](04-playground.md) (Compare) and
[Tutorial 5](05-catalog-scorecard-demo.md) (quality grades).

## Step 1: Open Search

1. Sidebar → **catalog** → **Search**\
   (URL: `/indexes/catalog/search`)
2. Notice one field (or control) per aspect, plus `k` and optional weights

## Step 2: Build a sparse query

Sparse means: only send aspects you care about. Omitted aspects are absent from
the query object. Enums **steer**; they do not hard-filter.

Try this:

1. Enable or fill **title** with: `gaming laptop`
2. Set **category** to `laptop` (enum control)
3. Set **price** to `900`
4. Leave **brand**, **rating**, and **released** empty / off
5. Set **k** to `5` (or `10` if you want a longer list)

## Step 3: Run the search

1. Click **Search** (submit on the form)
2. Results appear with ids and distances
3. Open the Request Inspector

Confirm the body looks roughly like:

```json
{
  "k": 5,
  "query": {
    "title": "gaming laptop",
    "category": "laptop",
    "price": 900
  }
}
```

Weights may be omitted when everything is `1`, depending on how the form builds
the request. Lower distance is better (closer match).

## Step 4: Read the ranking

At equal-ish weights you will often see `laptop-nimbus-play-15` (about 1499)
near or above `laptop-quanta-play-15` (about 899). Text likes “gaming laptop”;
price has not won yet. That order is what Playground and Scorecard will help you
fix with weights.

## Step 5: Optional flags

If the form exposes **withDocs** or **withExplanation**:

- Search page may not need explanations for a quick look
- Playground always wants explanations so it can re-rank locally

Leave advanced flags alone unless you are reading the API docs.

## Checkpoint

You can assemble a sparse query, submit it, and reconcile the UI with the
Request Inspector body.

Next: [Tutorial 4: Playground](04-playground.md).
