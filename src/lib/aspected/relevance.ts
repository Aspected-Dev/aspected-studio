import type { GoldenMetricKey, GoldenThresholds } from "./golden.ts"

/**
 * How one case scored against its judgements.
 *
 * Every ratio is in `0..1` and is `0` rather than `NaN` when the case cannot
 * be measured, so a set with an unjudged case still renders and still says
 * plainly that the case is failing.
 */
export type CaseScore = {
  /** Cut-off the case was graded at. */
  k: number
  /** Results the server returned, before the cut-off. */
  retrieved: number
  /** Judged documents for this case. */
  relevantTotal: number
  /** Judged documents inside the top `k`. */
  hits: number
  precision: number
  recall: number
  f1: number
  /** Reciprocal rank of the first relevant document, `0` when there is none. */
  mrr: number
  ndcg: number
  /** Average precision, the per-case term behind MAP. */
  ap: number
  firstRelevantRank: number | null
  /** Expected ids that did not reach the top `k`. */
  missing: string[]
  /** Returned ids with no judgement yet, in rank order. */
  unexpected: string[]
  /** Forbidden ids that reached the top `k`. */
  forbiddenHits: string[]
}

/** Aggregate across every scored case in a set. */
export type ScorecardSummary = {
  /** Cases considered, including ones that could not be scored. */
  cases: number
  /** Cases that produced a score. */
  scored: number
  precision: number
  recall: number
  mrr: number
  ndcg: number
  /** Mean average precision. */
  map: number
  green: number
  amber: number
  red: number
  /** Cases that returned at least one forbidden document. */
  forbidden: number
}

/** Chip colour for one case. */
export type CaseGrade = "green" | "amber" | "red"

/** Empty score used before a run lands, so tiles can render zeroes. */
export const EMPTY_SUMMARY: ScorecardSummary = {
  cases: 0,
  scored: 0,
  precision: 0,
  recall: 0,
  mrr: 0,
  ndcg: 0,
  map: 0,
  green: 0,
  amber: 0,
  red: 0,
  forbidden: 0,
}

/** Rank discount shared by DCG and IDCG. */
function discount(rank: number): number {
  return Math.log2(rank + 1)
}

/**
 * Scores one ranking against its judgements.
 *
 * Precision divides by `min(k, retrieved)` rather than `k`, so an index that
 * holds fewer than `k` documents is not marked down for slots it never had.
 * nDCG divides by the best ordering achievable at this `k`, which makes an
 * already ideal ranking score exactly `1` instead of drifting with set size.
 *
 * @param ranked - Document ids in rank order, best first.
 * @param judgements - Gain per expected id. Gains above `1` outrank plain hits.
 * @param k - Cut-off to grade at.
 * @param forbidden - Ids that must not appear. Reported, never scored.
 */
export function scoreCase(
  ranked: string[],
  judgements: Map<string, number>,
  k: number,
  forbidden: string[] = [],
): CaseScore {
  const cutoff = Math.max(0, Math.floor(k))
  const topK = ranked.slice(0, cutoff)
  const denominator = Math.min(cutoff, ranked.length)
  const relevantTotal = judgements.size
  const forbiddenSet = new Set(forbidden)

  let hits = 0
  let dcg = 0
  let precisionSum = 0
  let firstRelevantRank: number | null = null
  const unexpected: string[] = []
  const forbiddenHits: string[] = []
  const found = new Set<string>()

  for (let index = 0; index < topK.length; index += 1) {
    const id = topK[index]
    const rank = index + 1
    if (forbiddenSet.has(id)) {
      forbiddenHits.push(id)
    }

    const gain = judgements.get(id)
    if (gain === undefined || gain <= 0) {
      unexpected.push(id)
      continue
    }

    hits += 1
    found.add(id)
    dcg += gain / discount(rank)
    precisionSum += hits / rank
    if (firstRelevantRank === null) {
      firstRelevantRank = rank
    }
  }

  const idealGains = [...judgements.values()]
    .filter((gain) => gain > 0)
    .sort((left, right) => right - left)
    .slice(0, cutoff)
  const idcg = idealGains.reduce(
    (total, gain, index) => total + gain / discount(index + 1),
    0,
  )

  const precision = denominator === 0 ? 0 : hits / denominator
  const recall = relevantTotal === 0 ? 0 : hits / relevantTotal
  const apDenominator = Math.min(relevantTotal, cutoff)

  return {
    k: cutoff,
    retrieved: ranked.length,
    relevantTotal,
    hits,
    precision,
    recall,
    f1: precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall),
    mrr: firstRelevantRank === null ? 0 : 1 / firstRelevantRank,
    ndcg: idcg === 0 ? 0 : dcg / idcg,
    ap: apDenominator === 0 ? 0 : precisionSum / apDenominator,
    firstRelevantRank,
    missing: [...judgements.keys()].filter((id) => !found.has(id)),
    unexpected,
    forbiddenHits,
  }
}

/**
 * Value of one metric on a case score.
 */
export function metricValue(score: CaseScore, metric: GoldenMetricKey): number {
  if (metric === "precision") {
    return score.precision
  }
  if (metric === "recall") {
    return score.recall
  }
  if (metric === "mrr") {
    return score.mrr
  }
  return score.ndcg
}

/**
 * Chip colour for one case.
 *
 * A forbidden document outranks the metric entirely: a case that surfaces
 * something the user marked off-limits is a failure whatever else it got right.
 */
export function gradeCase(
  score: CaseScore,
  thresholds: GoldenThresholds,
): CaseGrade {
  if (score.forbiddenHits.length > 0) {
    return "red"
  }

  const value = metricValue(score, thresholds.metric)
  if (value >= thresholds.green) {
    return "green"
  }
  if (value >= thresholds.amber) {
    return "amber"
  }
  return "red"
}

/**
 * Aggregates case scores into the numbers on the summary tiles.
 *
 * Means are macro, so every case counts the same regardless of how many
 * documents it judges. A single hard case therefore cannot be drowned out by
 * a dozen easy ones, which is the behaviour you want from a regression guard.
 */
export function summariseScorecard(
  scores: CaseScore[],
  thresholds: GoldenThresholds,
): ScorecardSummary {
  if (scores.length === 0) {
    return { ...EMPTY_SUMMARY }
  }

  const summary: ScorecardSummary = {
    ...EMPTY_SUMMARY,
    cases: scores.length,
    scored: scores.length,
  }

  for (const score of scores) {
    summary.precision += score.precision
    summary.recall += score.recall
    summary.mrr += score.mrr
    summary.ndcg += score.ndcg
    summary.map += score.ap
    if (score.forbiddenHits.length > 0) {
      summary.forbidden += 1
    }

    const grade = gradeCase(score, thresholds)
    if (grade === "green") {
      summary.green += 1
    } else if (grade === "amber") {
      summary.amber += 1
    } else {
      summary.red += 1
    }
  }

  summary.precision /= scores.length
  summary.recall /= scores.length
  summary.mrr /= scores.length
  summary.ndcg /= scores.length
  summary.map /= scores.length
  return summary
}

/** Short metric names, without the cut-off. */
export const METRIC_LABELS: Record<GoldenMetricKey, string> = {
  precision: "Precision",
  recall: "Recall",
  mrr: "MRR",
  ndcg: "nDCG",
}

/**
 * Metric name for display, with the cut-off where it applies.
 *
 * MRR has no cut-off in its name because it only ever depends on the position
 * of the first relevant document.
 */
export function metricLabel(metric: GoldenMetricKey, k: number): string {
  if (metric === "mrr") {
    return METRIC_LABELS.mrr
  }
  return `${METRIC_LABELS[metric]}@${k}`
}

/**
 * Tooltip copy per metric: what it is, how it is computed, how to read it.
 *
 * Kept beside the maths so the explanation cannot drift from the formula.
 */
export const METRIC_HELP: Record<GoldenMetricKey, string> = {
  precision:
    "Share of the top k results that are in your expected list. Computed as hits divided by min(k, results returned). Read it as how much of the page is on target; 1.000 means no wasted slots.",
  recall:
    "Share of all expected documents that reached the top k. Computed as hits divided by the number of expected documents. High precision with low recall means the page is clean but incomplete, usually because k is too small or a weight is burying matches.",
  mrr:
    "Mean reciprocal rank. Per case, 1 divided by the position of the first expected document, then averaged over cases. 1.000 means every case leads with a relevant document, 0.500 means it typically sits second.",
  ndcg:
    "Discounted cumulative gain over the best ordering possible for this case. Each hit contributes its gain divided by log2(rank + 1), so rank 1 is worth far more than rank 10. 1.000 means the ranking is already ideal.",
}

/** Tooltip copy for the green, amber, and red case chips. */
export const CHIP_HELP =
  "Grade on the primary metric. Green at or above the green threshold, amber at or above the amber one, red below it. A case that returns a forbidden document is always red."

/** Tooltip copy for the mean average precision tile. */
export const MAP_HELP =
  "Mean average precision. Per case, precision is measured at every rank that holds a relevant document and averaged, then those averages are averaged over cases. Unlike precision@k it rewards putting the hits early rather than merely on the page."
