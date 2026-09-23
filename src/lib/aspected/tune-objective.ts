import { caseK, judgementMap } from "./golden.ts"
import type { GoldenCase, GoldenMetricKey, GoldenSet } from "./golden.ts"
import {
  type CaseScore,
  metricValue,
  type ScorecardSummary,
  scoreCase,
  summariseScorecard,
} from "./relevance.ts"
import { type CaseRun, runnableCases, scoreSet } from "./scorecard.ts"

/** Penalty weight per forbidden case fraction in the objective. */
export const FORBIDDEN_PENALTY = 0.2

/** Minimum noise floor when the measured repeat delta is tiny. */
export const NOISE_FLOOR_MIN = 0.002

/**
 * Hover help for Auto-tune result tiles and related controls.
 *
 * Objective = primary metric (usually nDCG) minus a forbidden-case penalty,
 * macro-averaged over the cases in scope.
 */
export const TUNE_RESULT_HELP = {
  startObjective:
    "Score of the config you started from (often all weights 1), on the train split when holdout is on. Same objective the search maximizes: primary metric minus forbidden-case penalty. Macro mean: each case counts equally.",
  championObjective:
    "Best config found on the train cases under this budget. Compare to Start: a gain within the noise floor is not a real win. Among near-tied configs, Auto-tune prefers fewer aspects, then smaller fetchK (parsimony).",
  holdout:
    "Same objective on cases held out while searching for weights. Scored in the Confirm stage. Prefer a run where holdout stays close to the train champion, then verify on Scorecard with Run set. Do not pick by the highest train or holdout score across reshuffled runs. n/a means holdout was off, the set was too small, or the run ended before Confirm.",
  holdoutSplit:
    "Reserves about 30% of runnable cases (at least 3 each side) and never uses them while searching. The champion is chosen on train; Confirm scores holdout (and may prefer a near-tied train config with a closer holdout). Turn off on tiny sets or when you only want a diagnostic run.",
  perCaseDelta:
    "Primary metric for each train case at the start config versus the champion. Holdout cases are omitted here. Watch for one case collapsing while the average rises.",
  noiseFloor:
    "How much the same start config can wobble when re-run Live. Gains smaller than this are treated as ties when comparing configs.",
} as const

/** Minimum absolute gap treated as "matched" even when noise is tinier. */
export const HOLDOUT_GAP_MATCHED_MIN = 0.02

/** Absolute train-minus-holdout lag still labeled mild (above matched band). */
export const HOLDOUT_GAP_MILD_LAG_MAX = 0.1

/** How holdout compares to the train champion objective. */
export type HoldoutGapKind =
  | "matched"
  | "mild_lag"
  | "overfit"
  | "holdout_ahead"

/** Classified holdout vs train gap with UI copy. */
export type HoldoutGapAssessment = {
  kind: HoldoutGapKind
  /** holdout − train champion objective. */
  delta: number
  /** One sentence for the Results callout. */
  message: string
}

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
 * Score for a case that produced no usable ranking.
 *
 * Grading an empty ranking gives zero on every metric, which keeps a trial
 * measured over its full scope instead of quietly shrinking the denominator.
 */
function zeroScore(set: GoldenSet, item: GoldenCase): CaseScore {
  return scoreCase([], judgementMap(item), caseK(set, item), item.forbidden)
}

/**
 * Live objective from cached runs graded in server order.
 *
 * Cases in scope that errored, or that never ran because the candidate config
 * left them nothing to query, score zero rather than dropping out. Macro means
 * weight every case equally, so dropping the hardest case would raise the
 * score and let a transient server failure win the champion slot.
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
  const scores = scored.map((entry) =>
    entry.score ?? zeroScore(scoped, entry.item)
  )
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

/** One case's primary metric before and after, for the results delta table. */
export type CaseDelta = CasePrimary & {
  /** Primary metric on the baseline runs. */
  baseline: number
  /** Champion primary minus baseline primary. */
  delta: number
}

/**
 * Per-case primary metric change between two sets of runs.
 *
 * Both maps have to cover the same scope. Comparing the baseline against a
 * holdout trial's runs returns nothing, because the case ids are disjoint.
 */
export function caseDeltas(
  set: GoldenSet,
  baselineRuns: Map<string, CaseRun>,
  championRuns: Map<string, CaseRun>,
): CaseDelta[] {
  const before = casePrimaries(set, baselineRuns)
  const after = new Map(
    casePrimaries(set, championRuns).map((item) => [item.caseId, item]),
  )

  return before.flatMap((item) => {
    const next = after.get(item.caseId)
    if (!next) {
      return []
    }
    return [{
      ...next,
      baseline: item.primary,
      delta: next.primary - item.primary,
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
 * Classifies holdout versus the train champion for Results guidance.
 *
 * Matched: |delta| within max(noiseFloor, {@link HOLDOUT_GAP_MATCHED_MIN}).
 * Mild lag: train ahead by up to {@link HOLDOUT_GAP_MILD_LAG_MAX}.
 * Overfit: larger train lead.
 * Holdout ahead: holdout above train beyond the matched band.
 */
export function classifyHoldoutGap(
  trainChampionValue: number,
  holdoutValue: number,
  noiseFloor: number,
): HoldoutGapAssessment {
  const delta = holdoutValue - trainChampionValue
  const matchedBand = Math.max(
    noiseFloor,
    NOISE_FLOOR_MIN,
    HOLDOUT_GAP_MATCHED_MIN,
  )
  if (Math.abs(delta) <= matchedBand) {
    return {
      kind: "matched",
      delta,
      message:
        "Holdout matches the train champion. Prefer this run, then verify on Scorecard with Run set before you trust the weights.",
    }
  }
  if (delta > matchedBand) {
    return {
      kind: "holdout_ahead",
      delta,
      message:
        "Holdout scored higher than train. That can be a lucky holdout slice; still verify on Scorecard with Run set.",
    }
  }
  const lag = -delta
  if (lag <= HOLDOUT_GAP_MILD_LAG_MAX) {
    return {
      kind: "mild_lag",
      delta,
      message:
        "Holdout is a little behind the train champion. Inspect the per-case table, then verify on Scorecard with Run set.",
    }
  }
  return {
    kind: "overfit",
    delta,
    message:
      "Holdout lagged the train champion by a wide margin. The win may not generalize; inspect the per-case table and prefer a run where holdout stays closer before applying in production.",
  }
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

/**
 * Below this runnable count (and at or above {@link HOLDOUT_MIN_CASES}), Setup
 * shows a plain-language note that the held-out slice is small.
 */
export const HOLDOUT_NOISY_CASE_MAX = 24

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
 * Deterministic train/holdout split over the cases a run can actually search.
 *
 * Splitting every enabled case would let unrunnable ones land in the holdout,
 * which is what the setup card's runnable count already promises against.
 *
 * @param weights - Start weights, used to decide what each case can query.
 */
export function splitRunnableHoldout(
  set: GoldenSet,
  weights: Record<string, number>,
  seed: number,
  options: {
    minCases?: number
    fraction?: number
    minHoldout?: number
  } = {},
): HoldoutSplit | null {
  return splitHoldout(runnableCases(set, weights), seed, options)
}

/**
 * Ensures grading depth stays at the set case k even when fetchK is larger.
 *
 * Callers pass this into UI copy; scoring already uses {@link caseK}.
 */
export function gradingK(set: GoldenSet, item: GoldenCase): number {
  return caseK(set, item)
}

/**
 * Deepest grading cut-off across the cases a run will actually search.
 *
 * Retrieval depth candidates are built from this rather than the set `k`, so
 * every candidate is at least as deep as every case's cut-off. Basing them on
 * the set `k` would offer depths that are already too shallow for a case that
 * overrides `k` upward.
 *
 * @param weights - Start weights, used to decide what each case can query.
 */
export function deepestGradingK(
  set: GoldenSet,
  weights: Record<string, number>,
): number {
  let deepest = set.k
  for (const item of runnableCases(set, weights)) {
    deepest = Math.max(deepest, caseK(set, item))
  }
  return deepest
}

/** One case a trial should search, with the depth its request must use. */
export type TrialCase = {
  item: GoldenCase
  /** Documents to fetch. Never shallower than the case grading cut-off. */
  fetchK: number
}

/**
 * Cases one trial should search, in set order, with per-case fetch depth.
 *
 * Two rules that the raw config cannot express on its own. A case with
 * nothing left to query under these weights is skipped rather than searched
 * with an empty query. A case graded deeper than `fetchK`, because it
 * overrides the set `k`, is fetched at its own cut-off so grading never reads
 * past the rows that were retrieved.
 *
 * @param caseIds - Scope for this trial, either train or holdout.
 */
export function trialCases(
  set: GoldenSet,
  weights: Record<string, number>,
  caseIds: readonly string[],
  fetchK: number,
): TrialCase[] {
  const scope = new Set(caseIds)
  return runnableCases(set, weights)
    .filter((item) => scope.has(item.id))
    .map((item) => ({
      item,
      fetchK: Math.max(fetchK, caseK(set, item)),
    }))
}
