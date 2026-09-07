import { rankedIds } from "./compare.ts"
import { caseK, judgementMap } from "./golden.ts"
import type { GoldenCase, GoldenSet } from "./golden.ts"
import { clampWeight, coerceAspectValue } from "./playground.ts"
import { multipliersFromSchema, rerank } from "./scoring.ts"
import { scoreCase } from "./relevance.ts"
import type { CaseScore } from "./relevance.ts"
import type {
  DistanceType,
  SearchIndexRequest,
  SearchResultRow,
  StoredAspect,
} from "./types.ts"

/** Result of running one case against the server. */
export type CaseRun = {
  caseId: string
  /** Rows as returned, fetched with `withExplanation: true`. */
  rows: SearchResultRow[]
  /** Weights the request carried, for every aspect in the case. */
  weightsUsed: Record<string, number>
  /** Body that produced these rows, so the inspector can show it. */
  request: SearchIndexRequest
  /** Request fingerprint, used to skip unchanged cases on a re-run. */
  signature: string
  /** Failure copy when the case could not be run. */
  error: string | null
}

/** Aspect rows on a case that will actually be queried. */
export function activeCaseAspects(
  item: GoldenCase,
  weights: Record<string, number>,
): GoldenCase["aspects"] {
  return item.aspects.filter((aspect) =>
    aspect.enabled && aspect.value.trim() !== "" &&
    clampWeight(weights[aspect.name] ?? 1) > 0
  )
}

/**
 * Weights for every aspect the case knows about, not just the queried ones.
 *
 * Mirrors `scoringWeights` on the playground form: an aspect left out of the
 * query is pinned to `0` so local re-scoring can tell "absent" apart from
 * "present at the default weight of 1".
 */
export function caseScoringWeights(
  item: GoldenCase,
  weights: Record<string, number>,
): Record<string, number> {
  const active = new Set(
    activeCaseAspects(item, weights).map((aspect) => aspect.name),
  )
  return Object.fromEntries(
    item.aspects.map((aspect) => [
      aspect.name,
      active.has(aspect.name) ? clampWeight(weights[aspect.name] ?? 1) : 0,
    ]),
  )
}

/**
 * Builds the search body for one case under a candidate set of weights.
 *
 * `withDocs` stays off because grading only needs ids, and `withExplanation`
 * stays on so the rows can be re-scored locally at any other weights without
 * another round trip.
 *
 * @throws SyntaxError when an aspect value cannot be coerced for its resolver.
 */
export function buildCaseRequest(
  item: GoldenCase,
  weights: Record<string, number>,
  k: number,
): SearchIndexRequest {
  const active = activeCaseAspects(item, weights)
  const query: Record<string, string | number | { $raw: number[] }> = {}
  const requestWeights: Record<string, number> = {}

  for (const aspect of active) {
    query[aspect.name] = coerceAspectValue(aspect.type, aspect.value)
    requestWeights[aspect.name] = clampWeight(weights[aspect.name] ?? 1)
  }

  const request: SearchIndexRequest = {
    k,
    query,
    withDocs: false,
    withExplanation: true,
  }

  if (Object.keys(requestWeights).length > 0) {
    request.weights = requestWeights
  }

  return request
}

/**
 * Fingerprint of the request a case would make right now.
 *
 * Weights are part of it because they change which documents come back, so a
 * weight edit correctly invalidates a cached run instead of grading stale rows.
 */
export function caseSignature(
  item: GoldenCase,
  weights: Record<string, number>,
  k: number,
): string {
  try {
    return JSON.stringify(buildCaseRequest(item, weights, k))
  } catch {
    return `invalid:${item.id}`
  }
}

/** Cases that are enabled and have at least one aspect to query. */
export function runnableCases(
  set: GoldenSet,
  weights: Record<string, number>,
): GoldenCase[] {
  return set.cases.filter((item) =>
    item.enabled && activeCaseAspects(item, weights).length > 0
  )
}

/** Minimal shape the ranking helpers need. */
type CaseRunLike = Pick<CaseRun, "rows" | "weightsUsed">

/** Document ids in the order the server returned them. */
export function rankRunAsReturned(run: CaseRunLike): string[] {
  return rankedIds(run.rows)
}

/**
 * Document ids re-ranked under candidate weights, without any request.
 *
 * This is what makes the scorecard usable as a live objective function: the
 * rows are already on the client, so grading a new weight set is arithmetic.
 * It carries the same limit as the playground preview, namely that a document
 * outside the fetched top `k` cannot appear however the weights move.
 */
export function rankRunAtWeights(
  run: CaseRunLike,
  item: GoldenCase,
  metric: DistanceType,
  weights: Record<string, number>,
  multipliers: Record<string, number>,
): string[] {
  return rerank(
    run.rows,
    metric,
    run.weightsUsed,
    caseScoringWeights(item, weights),
    multipliers,
  ).map((entry) => entry.row.id)
}

/**
 * Scores a run exactly as the server ordered it.
 *
 * Use this for the standalone scorecard, where the numbers should be server
 * truth rather than a local approximation.
 */
export function scoreRunAsReturned(
  run: CaseRun,
  item: GoldenCase,
  k: number,
): CaseScore {
  return scoreCase(
    rankRunAsReturned(run),
    judgementMap(item),
    k,
    item.forbidden,
  )
}

/**
 * Re-scores a cached run under candidate weights, without any request.
 */
export function scoreRunAtWeights(
  run: CaseRun,
  item: GoldenCase,
  metric: DistanceType,
  weights: Record<string, number>,
  multipliers: Record<string, number>,
  k: number,
): CaseScore {
  return scoreCase(
    rankRunAtWeights(run, item, metric, weights, multipliers),
    judgementMap(item),
    k,
    item.forbidden,
  )
}

/** One case paired with the score it earned and the ranking it was graded on. */
export type ScoredCase = {
  item: GoldenCase
  score: CaseScore | null
  /** Ids in graded order, best first. Empty when the case did not run. */
  ranked: string[]
  error: string | null
}

/**
 * Scores every runnable case in a set from cached runs.
 *
 * @param weights - Candidate weights. Omit to grade the rows as returned.
 */
export function scoreSet(
  set: GoldenSet,
  runs: Map<string, CaseRun>,
  options: {
    metric?: DistanceType
    weights?: Record<string, number>
    schema?: StoredAspect[]
  } = {},
): ScoredCase[] {
  const multipliers = options.schema
    ? multipliersFromSchema(options.schema)
    : {}

  return set.cases.map((item) => {
    const run = runs.get(item.id)
    if (!run) {
      return { item, score: null, ranked: [], error: null }
    }
    if (run.error !== null) {
      return { item, score: null, ranked: [], error: run.error }
    }

    const ranked = options.weights && options.metric
      ? rankRunAtWeights(
        run,
        item,
        options.metric,
        options.weights,
        multipliers,
      )
      : rankRunAsReturned(run)

    return {
      item,
      ranked,
      score: scoreCase(
        ranked,
        judgementMap(item),
        caseK(set, item),
        item.forbidden,
      ),
      error: null,
    }
  })
}

/**
 * True when two weight maps would produce the same request.
 *
 * Used to tell a live scorecard from a locally re-graded preview.
 */
export function sameWeights(
  left: Record<string, number>,
  right: Record<string, number>,
): boolean {
  const names = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const name of names) {
    if ((left[name] ?? 1) !== (right[name] ?? 1)) {
      return false
    }
  }
  return true
}
