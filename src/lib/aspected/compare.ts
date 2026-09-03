import type { PlaygroundFormValues } from "./playground.ts"
import type { SearchIndexRequest, SearchResultRow } from "./types.ts"

/**
 * Persistence parameter for rank-biased overlap.
 *
 * At `0.9`, the expected weight falls off so that roughly the top ten ranks
 * dominate the score (`1 / (1 - p)`). Kendall tau is deliberately not used: it
 * treats a swap at rank 40 the same as a swap at rank 1.
 */
export const RBO_P = 0.9

/** A frozen snapshot of a real playground search, used as config A. */
export type PinnedRun = {
  values: PlaygroundFormValues
  rows: SearchResultRow[]
  weightsUsed: Record<string, number>
  request: SearchIndexRequest
}

/** How one document moved between two ranked lists. */
export type CompareMovement = "up" | "down" | "same" | "entered" | "left"

/** One document's position in both rankings. */
export type CompareRow = {
  id: string
  rankA: number | null
  rankB: number | null
  distanceA: number | null
  distanceB: number | null
  /** `rankA - rankB`. Positive means the document rose in B. */
  delta: number | null
  movement: CompareMovement
}

/** Overlap of two top-k prefixes. */
export type OverlapAtDepth = {
  shared: number
  depth: number
  fraction: number
}

/** Aggregate of two ranked lists. */
export type ComparisonSummary = OverlapAtDepth & {
  rbo: number
  entered: number
  left: number
  maxShift: number
  meanAbsShift: number
}

/** One field that differs between two playground configs. */
export type ConfigChange =
  | { kind: "k"; from: string; to: string }
  | { kind: "weight"; name: string; from: number; to: number }
  | { kind: "enabled"; name: string; from: boolean; to: boolean }
  | { kind: "value"; name: string; from: string; to: string }

/** Recharts-friendly two-stage series for a bump chart. */
export type BumpSeries = {
  ids: string[]
  data: Array<Record<string, string | number | null>>
}

/**
 * Document ids ordered by ascending distance.
 *
 * Ties keep the order they arrived in, which matches how the server returns
 * results and how `rerank` sorts.
 */
export function rankedIds(
  rows: Array<{ id: string; distance: number }>,
): string[] {
  return [...rows]
    .sort((a, b) => a.distance - b.distance)
    .map((row) => row.id)
}

/**
 * Depth shared by two ranked lists.
 *
 * Both `k` values can differ, so every metric is reported at the shorter
 * prefix and the UI prints that depth.
 */
export function compareDepth(a: string[], b: string[]): number {
  return Math.min(a.length, b.length)
}

/**
 * Size of the intersection of the two top-`depth` prefixes.
 */
export function overlapAtDepth(
  a: string[],
  b: string[],
  depth: number,
): OverlapAtDepth {
  const capped = Math.max(0, Math.min(depth, a.length, b.length))
  if (capped === 0) {
    return { shared: 0, depth: 0, fraction: 0 }
  }

  const topA = new Set(a.slice(0, capped))
  let shared = 0
  for (const id of b.slice(0, capped)) {
    if (topA.has(id)) {
      shared += 1
    }
  }

  return { shared, depth: capped, fraction: shared / capped }
}

/**
 * Rank-biased overlap between two rankings, extrapolated to infinite depth.
 *
 * Both lists are truncated to the same depth `D` before scoring. The residual
 * term `(X_D / D) · p^D` makes identical prefixes score exactly `1`; without
 * it they would cap at `1 - p^D`, which looks like a bug at small `k`.
 *
 * @param p - Persistence. Defaults to {@link RBO_P}.
 * @param depth - Override for the shared prefix length. Defaults to
 *   {@link compareDepth}.
 */
export function rbo(
  a: string[],
  b: string[],
  p: number = RBO_P,
  depth?: number,
): number {
  const D = depth === undefined
    ? compareDepth(a, b)
    : Math.max(0, Math.min(depth, a.length, b.length))

  if (D === 0) {
    return 0
  }

  const seenA = new Set<string>()
  const seenB = new Set<string>()
  let intersection = 0
  let sum = 0
  let agreement = 0

  for (let d = 1; d <= D; d += 1) {
    const idA = a[d - 1]
    const idB = b[d - 1]

    if (!seenA.has(idA)) {
      seenA.add(idA)
      if (seenB.has(idA)) {
        intersection += 1
      }
    }
    if (!seenB.has(idB)) {
      seenB.add(idB)
      if (seenA.has(idB)) {
        intersection += 1
      }
    }

    agreement = intersection / d
    sum += agreement * p ** (d - 1)
  }

  return (1 - p) * sum + agreement * p ** D
}

/**
 * Joins two ranked lists by document id.
 *
 * Rows present in B come first, ordered by `rankB`. Documents that left B are
 * appended in their `rankA` order. `delta` is `rankA - rankB`, so a positive
 * value means the document rose under config B.
 */
export function compareRankings(
  a: Array<{ id: string; distance: number }>,
  b: Array<{ id: string; distance: number }>,
): CompareRow[] {
  const ranksA = new Map(
    rankedIds(a).map((id, index) => [id, index + 1]),
  )
  const ranksB = new Map(
    rankedIds(b).map((id, index) => [id, index + 1]),
  )
  const distanceA = new Map(a.map((row) => [row.id, row.distance]))
  const distanceB = new Map(b.map((row) => [row.id, row.distance]))

  const ids = new Set([...ranksA.keys(), ...ranksB.keys()])
  const rows: CompareRow[] = []

  for (const id of ids) {
    const rankA = ranksA.get(id) ?? null
    const rankB = ranksB.get(id) ?? null
    const delta = rankA !== null && rankB !== null ? rankA - rankB : null

    let movement: CompareMovement
    if (rankA === null) {
      movement = "entered"
    } else if (rankB === null) {
      movement = "left"
    } else if (delta === 0) {
      movement = "same"
    } else if ((delta as number) > 0) {
      movement = "up"
    } else {
      movement = "down"
    }

    rows.push({
      id,
      rankA,
      rankB,
      distanceA: distanceA.get(id) ?? null,
      distanceB: distanceB.get(id) ?? null,
      delta,
      movement,
    })
  }

  return rows.sort((left, right) => {
    if (left.rankB !== null && right.rankB !== null) {
      return left.rankB - right.rankB
    }
    if (left.rankB !== null) {
      return -1
    }
    if (right.rankB !== null) {
      return 1
    }
    return (left.rankA as number) - (right.rankA as number)
  })
}

/**
 * Aggregate metrics for two ranked lists.
 */
export function summariseComparison(
  a: Array<{ id: string; distance: number }>,
  b: Array<{ id: string; distance: number }>,
  p: number = RBO_P,
): ComparisonSummary {
  const idsA = rankedIds(a)
  const idsB = rankedIds(b)
  const depth = compareDepth(idsA, idsB)
  const overlap = overlapAtDepth(idsA, idsB, depth)
  const rows = compareRankings(a, b)

  let entered = 0
  let left = 0
  let maxShift = 0
  let shiftSum = 0
  let shiftCount = 0

  for (const row of rows) {
    if (row.movement === "entered") {
      entered += 1
    } else if (row.movement === "left") {
      left += 1
    } else if (row.delta !== null) {
      const abs = Math.abs(row.delta)
      maxShift = Math.max(maxShift, abs)
      shiftSum += abs
      shiftCount += 1
    }
  }

  return {
    ...overlap,
    rbo: rbo(idsA, idsB, p, depth),
    entered,
    left,
    maxShift,
    meanAbsShift: shiftCount === 0 ? 0 : shiftSum / shiftCount,
  }
}

/**
 * Field-level differences between two playground form states.
 *
 * Used to label the compare header after a long tweaking session so the user
 * can see exactly what separates A from B.
 */
export function diffConfigs(
  a: PlaygroundFormValues,
  b: PlaygroundFormValues,
): ConfigChange[] {
  const changes: ConfigChange[] = []

  if (a.k !== b.k) {
    changes.push({ kind: "k", from: a.k, to: b.k })
  }

  const byName = new Map(b.aspects.map((aspect) => [aspect.name, aspect]))

  for (const aspectA of a.aspects) {
    const aspectB = byName.get(aspectA.name)
    if (aspectB === undefined) {
      continue
    }

    if (aspectA.enabled !== aspectB.enabled) {
      changes.push({
        kind: "enabled",
        name: aspectA.name,
        from: aspectA.enabled,
        to: aspectB.enabled,
      })
    }

    if (aspectA.value !== aspectB.value) {
      changes.push({
        kind: "value",
        name: aspectA.name,
        from: aspectA.value,
        to: aspectB.value,
      })
    }

    if (aspectA.weight !== aspectB.weight) {
      changes.push({
        kind: "weight",
        name: aspectA.name,
        from: aspectA.weight,
        to: aspectB.weight,
      })
    }
  }

  return changes
}

/**
 * Maps 1-based ranks to document ids for one side of a bump chart.
 */
export function idByRank(
  rows: Array<{ id: string; distance: number }>,
): Map<number, string> {
  return new Map(rankedIds(rows).map((id, index) => [index + 1, id]))
}

/**
 * Builds the two-stage Recharts series for a bump chart.
 *
 * Only documents that appear in the top `limit` of either side are included,
 * so a large `k` does not draw fifty overlapping lines. Absent ranks are
 * `null`, which leaves entered and left documents as a single dot.
 */
export function bumpSeries(
  rows: CompareRow[],
  limit: number,
): BumpSeries {
  const capped = rows.filter((row) =>
    (row.rankA !== null && row.rankA <= limit) ||
    (row.rankB !== null && row.rankB <= limit)
  )
  const ids = capped.map((row) => row.id)

  const stageA: Record<string, string | number | null> = { stage: "A" }
  const stageB: Record<string, string | number | null> = { stage: "B" }

  for (const row of capped) {
    stageA[row.id] = row.rankA
    stageB[row.id] = row.rankB
  }

  return { ids, data: [stageA, stageB] }
}
