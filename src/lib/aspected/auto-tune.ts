import { SLIDER_STEPS, sliderToWeight } from "./playground.ts"
import { summariseScorecard } from "./relevance.ts"
import {
  type CaseRun,
  rankRunAtWeights,
  runnableCases,
  scoreSet,
} from "./scorecard.ts"
import type { GoldenSet } from "./golden.ts"
import type { DistanceType, StoredAspect } from "./types.ts"

/** Default stride matching the Playground Scorecard sweep chart. */
export const DEFAULT_SWEEP_STRIDE = 4

/** nDCG slack when preferring an interior peak over an edge max. */
export const PEAK_EDGE_EPSILON = 0.002

/** Coordinate-ascent rounds before giving up. */
export const DEFAULT_ASCENT_ROUNDS = 3

/** One sample on an aspect sweep curve. */
export type SweepPoint = {
  weight: number
  ndcg: number
}

/** Absolute max vs preferred interior peak. */
export type SweepPeakKind = "edge" | "interior"

/** Result of {@link pickSweepPeak}. */
export type SweepPeak = SweepPoint & {
  kind: SweepPeakKind
  /** Index into the points array. */
  index: number
}

/** One aspect update during coordinate ascent. */
export type SuggestStep = {
  round: number
  aspect: string
  from: number
  to: number
  ndcg: number
  peakKind: SweepPeakKind
}

/** Result of {@link suggestWeights}. */
export type SuggestWeightsResult = {
  weights: Record<string, number>
  startNdcg: number
  previewNdcg: number
  history: SuggestStep[]
  usedEdgePeak: boolean
}

/** Cap on tracked ids in a rank-vs-weight chart. */
export const RANK_VS_WEIGHT_ID_CAP = 8

/**
 * Macro nDCG for a golden set under candidate weights (local Preview path).
 */
export function previewSetNdcg(
  set: GoldenSet,
  runs: Map<string, CaseRun>,
  metric: DistanceType,
  weights: Record<string, number>,
  schema: StoredAspect[],
): number {
  const scored = scoreSet(set, runs, { metric, weights, schema })
  return summariseScorecard(
    scored.filter((entry) => entry.score !== null).map((entry) => entry.score!),
    set.thresholds,
  ).ndcg
}

/**
 * Samples nDCG across the log-scale slider for one aspect, holding others fixed.
 */
export function sweepAspectNdcg(
  set: GoldenSet,
  runs: Map<string, CaseRun>,
  metric: DistanceType,
  weights: Record<string, number>,
  schema: StoredAspect[],
  aspectName: string,
  stride: number = DEFAULT_SWEEP_STRIDE,
): SweepPoint[] {
  const points: SweepPoint[] = []
  for (let step = 0; step <= SLIDER_STEPS; step += stride) {
    const weight = sliderToWeight(step)
    const candidate = { ...weights, [aspectName]: weight }
    points.push({
      weight,
      ndcg: previewSetNdcg(set, runs, metric, candidate, schema),
    })
  }
  return points
}

/**
 * Chooses a sweep peak, preferring an interior sample near the absolute max.
 *
 * Edge maxima (first or last grid point) are often Preview artifacts at the
 * slider rails. When an interior point is within {@link PEAK_EDGE_EPSILON} of
 * the absolute max, that interior point wins.
 */
export function pickSweepPeak(
  points: SweepPoint[],
  epsilon: number = PEAK_EDGE_EPSILON,
): SweepPeak | null {
  if (points.length === 0) {
    return null
  }

  let absIndex = 0
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].ndcg > points[absIndex].ndcg) {
      absIndex = index
    }
  }

  const atEdge = absIndex === 0 || absIndex === points.length - 1
  if (!atEdge || points.length < 3) {
    return {
      ...points[absIndex],
      kind: atEdge ? "edge" : "interior",
      index: absIndex,
    }
  }

  let interiorIndex = 1
  for (let index = 2; index < points.length - 1; index += 1) {
    if (points[index].ndcg > points[interiorIndex].ndcg) {
      interiorIndex = index
    }
  }

  if (points[absIndex].ndcg - points[interiorIndex].ndcg <= epsilon) {
    return {
      ...points[interiorIndex],
      kind: "interior",
      index: interiorIndex,
    }
  }

  return {
    ...points[absIndex],
    kind: "edge",
    index: absIndex,
  }
}

/**
 * Aspect names that appear enabled on at least one runnable golden case.
 */
export function tunableAspectNames(
  set: GoldenSet,
  weights: Record<string, number>,
): string[] {
  const names = new Set<string>()
  for (const item of runnableCases(set, weights)) {
    for (const aspect of item.aspects) {
      if (aspect.enabled && aspect.value.trim() !== "") {
        names.add(aspect.name)
      }
    }
  }
  return [...names]
}

/**
 * Coordinate ascent over aspect weights to raise Preview nDCG on cached runs.
 *
 * Each round sweeps every tunable aspect while holding the others fixed and
 * writes that aspect to {@link pickSweepPeak}. Stops early when a full round
 * gains less than {@link PEAK_EDGE_EPSILON}.
 */
export function suggestWeights(options: {
  set: GoldenSet
  runs: Map<string, CaseRun>
  metric: DistanceType
  schema: StoredAspect[]
  startWeights: Record<string, number>
  aspectNames?: string[]
  rounds?: number
  stride?: number
  epsilon?: number
}): SuggestWeightsResult {
  const {
    set,
    runs,
    metric,
    schema,
    startWeights,
    rounds = DEFAULT_ASCENT_ROUNDS,
    stride = DEFAULT_SWEEP_STRIDE,
    epsilon = PEAK_EDGE_EPSILON,
  } = options
  const aspectNames = options.aspectNames ??
    tunableAspectNames(set, startWeights)

  let weights = { ...startWeights }
  const startNdcg = previewSetNdcg(set, runs, metric, weights, schema)
  let currentNdcg = startNdcg
  const history: SuggestStep[] = []
  let usedEdgePeak = false

  for (let round = 1; round <= rounds; round += 1) {
    const roundStart = currentNdcg
    for (const aspect of aspectNames) {
      const points = sweepAspectNdcg(
        set,
        runs,
        metric,
        weights,
        schema,
        aspect,
        stride,
      )
      const peak = pickSweepPeak(points, epsilon)
      if (peak === null) {
        continue
      }
      const from = weights[aspect] ?? 1
      if (from === peak.weight && peak.ndcg <= currentNdcg) {
        continue
      }
      weights = { ...weights, [aspect]: peak.weight }
      currentNdcg = peak.ndcg
      if (peak.kind === "edge") {
        usedEdgePeak = true
      }
      history.push({
        round,
        aspect,
        from,
        to: peak.weight,
        ndcg: peak.ndcg,
        peakKind: peak.kind,
      })
    }
    if (currentNdcg - roundStart < epsilon) {
      break
    }
  }

  return {
    weights,
    startNdcg,
    previewNdcg: previewSetNdcg(set, runs, metric, weights, schema),
    history,
    usedEdgePeak,
  }
}

/**
 * Ids to plot on a rank-vs-weight chart for one case: expected (capped) then
 * forbidden.
 */
export function rankVsWeightIds(
  expectedIds: string[],
  forbiddenIds: string[] = [],
  cap: number = RANK_VS_WEIGHT_ID_CAP,
): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const id of expectedIds) {
    if (seen.has(id) || ids.length >= cap) {
      continue
    }
    seen.add(id)
    ids.push(id)
  }
  for (const id of forbiddenIds) {
    if (seen.has(id)) {
      continue
    }
    seen.add(id)
    ids.push(id)
  }
  return ids
}

/**
 * Rank of each tracked id across a weight sweep (1-based; null if absent).
 */
export function sweepRankVsWeight(
  set: GoldenSet,
  runs: Map<string, CaseRun>,
  metric: DistanceType,
  weights: Record<string, number>,
  schema: StoredAspect[],
  aspectName: string,
  caseId: string,
  trackedIds: string[],
  stride: number = DEFAULT_SWEEP_STRIDE,
): Array<Record<string, string | number | null>> {
  const item = set.cases.find((entry) => entry.id === caseId)
  const run = runs.get(caseId)
  if (!item || !run || run.error !== null || trackedIds.length === 0) {
    return []
  }

  const multipliers = Object.fromEntries(
    schema.map((aspect) => [aspect.name, aspect.multiplier ?? 1]),
  )
  const rows: Array<Record<string, string | number | null>> = []

  for (let step = 0; step <= SLIDER_STEPS; step += stride) {
    const weight = sliderToWeight(step)
    const candidate = { ...weights, [aspectName]: weight }
    const ranked = rankRunAtWeights(run, item, metric, candidate, multipliers)
    const point: Record<string, string | number | null> = { weight }
    for (const id of trackedIds) {
      const position = ranked.indexOf(id)
      point[id] = position === -1 ? null : position + 1
    }
    rows.push(point)
  }

  return rows
}
