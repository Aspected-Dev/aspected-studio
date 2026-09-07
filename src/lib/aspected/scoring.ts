import type { DistanceType, SearchResultRow, StoredAspect } from "./types.ts"

/**
 * Per-aspect quantity recovered from a search explanation, with the request
 * weight divided back out so it can be re-scored under any other weight.
 *
 * `raw` is `null` when the server withheld a distance, which happens when the
 * aspect was omitted from the query or sent with weight `0`.
 */
export type AspectGrade = {
  name: string
  raw: number | null
  value: unknown
}

/**
 * One aspect's share of a re-scored result, for the stacked contribution bar.
 *
 * Amounts are non-negative and sum to the row's total distance, so a longer
 * segment always means that aspect is pushing the document further away.
 */
export type AspectContribution = {
  name: string
  amount: number
}

/** A search result re-scored against a candidate set of weights. */
export type RerankedRow = {
  row: SearchResultRow
  /** Recomputed total under the supplied weights. Lower is always better. */
  distance: number
  /** Distance reported by the server for this row, kept for deviation checks. */
  serverDistance: number
  grades: AspectGrade[]
  contributions: AspectContribution[]
}

/**
 * Whether a metric's per-aspect explanation distances sum to the total.
 *
 * Manhattan, Euclidean, and DotProduct accumulate independently per dimension,
 * so slicing by aspect and summing reproduces the total exactly. Cosine
 * normalises across every dimension at once and therefore does not.
 */
export function isAdditive(metric: DistanceType): boolean {
  return metric !== "Cosine"
}

/**
 * Exponent applied to a weight when it scales an aspect's contribution.
 *
 * Manhattan is linear in the weight because it sums `|wb - wa|`. The squared
 * metrics are quadratic because both operands carry the weight.
 */
function weightExponent(metric: DistanceType): number {
  return metric === "Manhattan" ? 1 : 2
}

/**
 * Collapses float noise around zero without erasing real DotProduct scores.
 *
 * Perfect Cosine matches often arrive as ±1e-7 from the server. Those values
 * are not meaningful distance, but they print as `-0.000` and blow out chart
 * axes if left alone.
 */
function snapFloatNoise(value: number): number {
  return Math.abs(value) < 1e-6 ? 0 : value
}

/** Reads the aspect name from an explanation entry, tolerating either field. */
function explanationName(
  entry: { name?: string; aspectName?: string },
): string | undefined {
  return entry.name ?? entry.aspectName
}

/**
 * Recovers weight-independent grades from one search result.
 *
 * The server weights every dimension of an aspect identically, so the request
 * weight factors out of that aspect's slice and can be divided away. Cosine is
 * already weight-invariant per aspect because the weight cancels between its
 * dot product and its norms.
 *
 * @param row - A result row that was fetched with `withExplanation: true`.
 * @param metric - Distance type of the index.
 * @param weightsUsed - Weights sent on the request that produced `row`.
 *   Missing entries default to `1`, matching the server.
 */
export function recoverGrades(
  row: SearchResultRow,
  metric: DistanceType,
  weightsUsed: Record<string, number>,
): AspectGrade[] {
  const explanation = row.explanation ?? []
  const exponent = weightExponent(metric)

  return explanation.flatMap((entry) => {
    const name = explanationName(entry)
    if (name === undefined) {
      return []
    }

    const grade: AspectGrade = { name, raw: null, value: entry.value }
    if (entry.distance === undefined) {
      return [grade]
    }

    if (!isAdditive(metric)) {
      return [{ ...grade, raw: snapFloatNoise(entry.distance) }]
    }

    const weight = weightsUsed[name] ?? 1
    if (weight <= 0) {
      return [grade]
    }

    return [{
      ...grade,
      raw: snapFloatNoise(entry.distance / weight ** exponent),
    }]
  })
}

/**
 * Effective scale of an aspect: the query weight times the index multiplier.
 *
 * The multiplier is baked into stored vectors at ingest time, so it is part of
 * an aspect's real influence even though it never appears in a request.
 */
function effectiveScale(
  name: string,
  weights: Record<string, number>,
  multipliers: Record<string, number>,
): number {
  const weight = weights[name] ?? 1
  const multiplier = multipliers[name] ?? 1
  return weight * multiplier
}

/**
 * Re-scores one result's grades under a candidate set of weights.
 *
 * Every metric produces a stack of amounts that sums to the total distance, so
 * one chart shape works for all four and a shorter bar always means a closer
 * match (or, for DotProduct, a stronger hit when more negative).
 *
 * Additive metrics reassemble the total exactly. Cosine is a weighted mean of
 * per-aspect distances, which is exact when each aspect's query and document
 * vectors share a norm. That holds for the radial resolvers and is close for
 * text.
 */
function scoreGrades(
  grades: AspectGrade[],
  metric: DistanceType,
  weights: Record<string, number>,
  multipliers: Record<string, number>,
): { distance: number; contributions: AspectContribution[] } {
  const active = grades.filter((grade) =>
    grade.raw !== null && (weights[grade.name] ?? 1) > 0
  )

  if (active.length === 0) {
    return { distance: Number.POSITIVE_INFINITY, contributions: [] }
  }

  const shares = isAdditive(metric)
    ? active.map((grade) =>
      (weights[grade.name] ?? 1) ** weightExponent(metric)
    )
    : normalised(
      active.map((grade) =>
        effectiveScale(grade.name, weights, multipliers) ** 2
      ),
    )

  if (shares === null) {
    return { distance: Number.POSITIVE_INFINITY, contributions: [] }
  }

  const contributions = active.map((grade, position) => ({
    name: grade.name,
    amount: snapFloatNoise(shares[position] * (grade.raw as number)),
  }))

  return {
    distance: contributions.reduce((sum, item) => sum + item.amount, 0),
    contributions,
  }
}

/**
 * Scales values so they sum to 1, or `null` when they sum to nothing.
 *
 * Cosine normalises across every dimension at once, so an aspect's share of the
 * total is relative to the other aspects rather than absolute.
 */
function normalised(values: number[]): number[] | null {
  const total = values.reduce((sum, value) => sum + value, 0)
  if (total === 0) {
    return null
  }
  return values.map((value) => value / total)
}

/**
 * Re-ranks a result set under new weights without calling the server.
 *
 * Only the candidate rows already fetched are considered, so a document that
 * would enter the top `k` under the new weights but was not returned cannot
 * appear. Callers should treat the output as a preview of the next real search.
 *
 * @param rows - Rows from a search made with `withExplanation: true`.
 * @param metric - Distance type of the index.
 * @param weightsUsed - Weights sent on the request that produced `rows`.
 * @param weights - Candidate weights to score against.
 * @param multipliers - Index-time multiplier per aspect, used by Cosine.
 */
export function rerank(
  rows: SearchResultRow[],
  metric: DistanceType,
  weightsUsed: Record<string, number>,
  weights: Record<string, number>,
  multipliers: Record<string, number>,
): RerankedRow[] {
  return rows
    .map((row) => {
      const grades = recoverGrades(row, metric, weightsUsed)
      const scored = scoreGrades(grades, metric, weights, multipliers)
      return {
        row,
        distance: scored.distance,
        serverDistance: snapFloatNoise(row.distance),
        grades,
        contributions: scored.contributions,
      }
    })
    .sort((a, b) => a.distance - b.distance)
}

/**
 * Largest gap between a re-scored total and the distance the server reported,
 * measured at the weights the server actually used.
 *
 * Zero for additive metrics. Non-zero for Cosine, where it quantifies how much
 * the weighted-mean approximation drifts on this data.
 *
 * @returns The maximum absolute error, or `0` when nothing can be compared.
 */
export function previewDeviation(
  rows: SearchResultRow[],
  metric: DistanceType,
  weightsUsed: Record<string, number>,
  multipliers: Record<string, number>,
): number {
  const scored = rerank(rows, metric, weightsUsed, weightsUsed, multipliers)

  return scored.reduce((worst, item) => {
    if (!Number.isFinite(item.distance)) {
      return worst
    }
    return Math.max(worst, Math.abs(item.distance - item.serverDistance))
  }, 0)
}

/**
 * Whether every requested aspect has a grade available for previewing.
 *
 * Returns `false` once a user enables an aspect that the last search sent at
 * weight `0`, because the server withheld its distance and there is nothing to
 * re-score from. The caller should fall back to a real search.
 */
export function hasCompleteGrades(
  grades: AspectGrade[],
  activeAspectNames: string[],
): boolean {
  return activeAspectNames.every((name) =>
    grades.some((grade) => grade.name === name && grade.raw !== null)
  )
}

/**
 * Multiplier per aspect name, defaulting to `1` where the server omitted one.
 */
export function multipliersFromSchema(
  schema: StoredAspect[],
): Record<string, number> {
  return Object.fromEntries(
    schema.map((aspect) => [aspect.name, aspect.multiplier ?? 1]),
  )
}
