import { caseK } from "./golden.ts"
import type { GoldenCase, GoldenMetricKey, GoldenSet } from "./golden.ts"
import {
  metricValue,
  type ScorecardSummary,
  summariseScorecard,
} from "./relevance.ts"
import { type CaseRun, scoreSet } from "./scorecard.ts"

/** Penalty weight per forbidden case fraction in the objective. */
export const FORBIDDEN_PENALTY = 0.2

/** Minimum noise floor when the measured repeat delta is tiny. */
export const NOISE_FLOOR_MIN = 0.002

/** Live objective for one scored config. */
export type TuneObjective = {
  /** Primary metric macro mean, graded Live. */
  primary: number
  /** primary minus forbidden penalty; what the search maximizes. */
  value: number
  summary: ScorecardSummary
}

/** One case's primary metric for before/after tables. */
export type CasePrimary = {
  caseId: string
  name: string
  primary: number
  forbidden: boolean
}

/**
 * Reads the set's primary metric off a summary.
 */
export function summaryPrimary(
  summary: ScorecardSummary,
  metric: GoldenMetricKey,
): number {
  if (metric === "precision") {
    return summary.precision
  }
  if (metric === "recall") {
    return summary.recall
  }
  if (metric === "mrr") {
    return summary.mrr
  }
  return summary.ndcg
}

/**
 * Live objective from cached runs graded in server order.
 *
 * @param caseIds - When set, only these cases contribute (train or holdout).
 */
export function liveObjective(
  set: GoldenSet,
  runs: Map<string, CaseRun>,
  caseIds?: ReadonlySet<string>,
): TuneObjective {
  const scoped: GoldenSet = caseIds
    ? {
      ...set,
      cases: set.cases.filter((item) => caseIds.has(item.id)),
    }
    : set

  const scored = scoreSet(scoped, runs, {})
  const scores = scored
    .filter((entry) => entry.score !== null)
    .map((entry) => entry.score!)
  const summary = summariseScorecard(scores, scoped.thresholds)
  const primary = summaryPrimary(summary, scoped.thresholds.metric)
  const cases = Math.max(1, summary.cases)
  const value = primary - FORBIDDEN_PENALTY * (summary.forbidden / cases)
  return { primary, value, summary }
}

/**
 * Per-case primary metric values for delta tables.
 */
export function casePrimaries(
  set: GoldenSet,
  runs: Map<string, CaseRun>,
  caseIds?: ReadonlySet<string>,
): CasePrimary[] {
  const items = caseIds
    ? set.cases.filter((item) => caseIds.has(item.id))
    : set.cases
  const scored = scoreSet({ ...set, cases: items }, runs, {})
  return scored.flatMap((entry) => {
    if (entry.score === null) {
      return []
    }
    return [{
      caseId: entry.item.id,
      name: entry.item.name,
      primary: metricValue(entry.score, set.thresholds.metric),
      forbidden: entry.score.forbiddenHits.length > 0,
    }]
  })
}

/**
 * How many aspects have a positive weight (enabled for scoring).
 */
export function enabledAspectCount(weights: Record<string, number>): number {
  let count = 0
  for (const weight of Object.values(weights)) {
    if (weight > 0) {
      count += 1
    }
  }
  return count
}

/**
 * Squared log-distance between two weight maps (missing keys treated as 1).
 */
export function weightDistance(
  left: Record<string, number>,
  right: Record<string, number>,
): number {
  const names = new Set([...Object.keys(left), ...Object.keys(right)])
  let sum = 0
  for (const name of names) {
    const a = left[name] ?? 1
    const b = right[name] ?? 1
    if (a <= 0 && b <= 0) {
      continue
    }
    if (a <= 0 || b <= 0) {
      sum += 4
      continue
    }
    const delta = Math.log10(a) - Math.log10(b)
    sum += delta * delta
  }
  return sum
}

/**
 * True when `candidate` is at least as good as `champion` under the noise
 * floor, preferring fewer enabled aspects, then smaller fetchK, then closer
 * to `start`.
 */
export function isBetterConfig(
  candidate: {
    value: number
    weights: Record<string, number>
    fetchK: number
  },
  champion: {
    value: number
    weights: Record<string, number>
    fetchK: number
  },
  start: { weights: Record<string, number>; fetchK: number },
  noiseEpsilon: number,
): boolean {
  const gain = candidate.value - champion.value
  if (gain > noiseEpsilon) {
    return true
  }
  if (gain < -noiseEpsilon) {
    return false
  }

  const candidateEnabled = enabledAspectCount(candidate.weights)
  const championEnabled = enabledAspectCount(champion.weights)
  if (candidateEnabled !== championEnabled) {
    return candidateEnabled < championEnabled
  }
  if (candidate.fetchK !== champion.fetchK) {
    return candidate.fetchK < champion.fetchK
  }
  return weightDistance(candidate.weights, start.weights) <
    weightDistance(champion.weights, start.weights)
}

/**
 * Labels a gain relative to a measured noise floor.
 */
export function noiseLabel(
  gain: number,
  noiseFloor: number,
): "noise" | "real" {
  return Math.abs(gain) <= Math.max(noiseFloor, NOISE_FLOOR_MIN)
    ? "noise"
    : "real"
}

/**
 * Effective noise epsilon from a baseline repeat delta.
 */
export function measuredNoiseFloor(repeatDelta: number): number {
  return Math.max(Math.abs(repeatDelta), NOISE_FLOOR_MIN)
}

/** Mulberry32 seeded PRNG for deterministic holdout splits. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let next = state
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

/** Default when holdout is on and the set is large enough. */
export const HOLDOUT_MIN_CASES = 8

/** Rough holdout fraction. */
export const HOLDOUT_FRACTION = 0.3

/** Minimum holdout cases when splitting. */
export const HOLDOUT_MIN_SIZE = 3

/** Train / holdout case ids for one run. */
export type HoldoutSplit = {
  trainIds: string[]
  holdoutIds: string[]
  seed: number
}

/**
 * Deterministic train/holdout split of runnable cases.
 *
 * Returns null when the set is too small for a useful holdout.
 */
export function splitHoldout(
  cases: GoldenCase[],
  seed: number,
  options: {
    minCases?: number
    fraction?: number
    minHoldout?: number
  } = {},
): HoldoutSplit | null {
  const minCases = options.minCases ?? HOLDOUT_MIN_CASES
  const fraction = options.fraction ?? HOLDOUT_FRACTION
  const minHoldout = options.minHoldout ?? HOLDOUT_MIN_SIZE

  const ids = cases.filter((item) => item.enabled).map((item) => item.id)
  if (ids.length < minCases) {
    return null
  }

  const target = Math.max(
    minHoldout,
    Math.min(
      ids.length - minHoldout,
      Math.round(ids.length * fraction),
    ),
  )
  if (target < minHoldout || ids.length - target < minHoldout) {
    return null
  }

  const random = mulberry32(seed)
  const shuffled = [...ids]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1))
    const swap = shuffled[index]
    shuffled[index] = shuffled[pick]
    shuffled[pick] = swap
  }

  return {
    trainIds: shuffled.slice(target),
    holdoutIds: shuffled.slice(0, target),
    seed,
  }
}

/**
 * Ensures grading depth stays at the set case k even when fetchK is larger.
 *
 * Callers pass this into UI copy; scoring already uses {@link caseK}.
 */
export function gradingK(set: GoldenSet, item: GoldenCase): number {
  return caseK(set, item)
}
