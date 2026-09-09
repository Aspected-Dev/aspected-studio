import { describe, expect, it } from "vitest"
import { emptyGoldenSet } from "./golden.ts"
import type { GoldenCase, GoldenSet } from "./golden.ts"
import {
  FORBIDDEN_PENALTY,
  liveObjective,
  measuredNoiseFloor,
  type TuneObjective,
} from "./tune-objective.ts"
import { buildCaseRequest, type CaseRun } from "./scorecard.ts"
import {
  BUDGET_PRESETS,
  championOf,
  COARSE_WEIGHT_GRID,
  createTunerState,
  defaultTuneSpace,
  nextCandidates,
  recordTrial,
  snapWeight,
  type TuneConfig,
  type TunerState,
  type TuneTrial,
} from "./tuner.ts"
import type { SearchResultRow, StoredAspect } from "./types.ts"

const schema = [
  { name: "title", type: "text" },
  { name: "price", type: "number" },
  { name: "brand", type: "text" },
] as StoredAspect[]

/** Aspect names the synthetic set queries, in start order. */
const ASPECTS = ["title", "price", "brand"]

/** Start config every oracle run begins from. */
const START: TuneConfig = {
  weights: { title: 1, price: 1, brand: 1 },
  fetchK: 5,
}

function oracleCase(id: string): GoldenCase {
  return {
    id,
    name: id,
    aspects: [
      { name: "title", type: "text", enabled: true, value: "gaming laptop" },
      { name: "price", type: "number", enabled: true, value: "900" },
      { name: "brand", type: "text", enabled: true, value: "nimbus" },
    ],
    expected: [{ id: "hit", gain: 1 }],
    forbidden: [],
    k: null,
    notes: "",
    tags: [],
    enabled: true,
  }
}

function oracleSet(count: number): GoldenSet {
  return {
    ...emptyGoldenSet("catalog", schema),
    k: 5,
    cases: Array.from({ length: count }, (_, index) => oracleCase(`c${index}`)),
  }
}

/** Wraps a scalar oracle value as the objective shape the planner reads. */
function objectiveOf(value: number): TuneObjective {
  return {
    primary: value,
    value,
    summary: {
      cases: 1,
      scored: 1,
      precision: value,
      recall: value,
      mrr: value,
      ndcg: value,
      map: value,
      green: 1,
      amber: 0,
      red: 0,
      forbidden: 0,
    },
  }
}

/**
 * Every weight a run can settle on: the snapped coarse grid, plus off.
 *
 * The coarse stage proposes exactly these, and the screen stage adds `0`.
 * Refine can land between them, so an oracle used with {@link bestOnGrid}
 * has to peak on this grid for the comparison to be fair.
 */
const REACHABLE_WEIGHTS = [0, ...COARSE_WEIGHT_GRID.map(snapWeight)]

/** Every weight combination over `names`, for exhaustive enumeration. */
function weightCombinations(
  names: string[],
): Array<Record<string, number>> {
  let combinations: Array<Record<string, number>> = [{}]
  for (const name of names) {
    const next: Array<Record<string, number>> = []
    for (const combination of combinations) {
      for (const weight of REACHABLE_WEIGHTS) {
        next.push({ ...combination, [name]: weight })
      }
    }
    combinations = next
  }
  return combinations
}

/** Brute force optimum over {@link REACHABLE_WEIGHTS}, for comparison. */
function bestOnGrid(
  names: string[],
  value: (config: TuneConfig) => number,
  fetchK: number,
): { weights: Record<string, number>; value: number } {
  let bestWeights: Record<string, number> = {}
  let bestValue = -Infinity

  for (const weights of weightCombinations(names)) {
    const candidate = value({ weights, fetchK })
    if (candidate > bestValue) {
      bestValue = candidate
      bestWeights = weights
    }
  }

  return { weights: bestWeights, value: bestValue }
}

/** Oracle signature: scope is passed so a holdout can be scored differently. */
type Oracle = (config: TuneConfig, scope: TuneTrial["scope"]) => number

/**
 * Drives a run to completion one trial at a time against a fake oracle.
 *
 * Every trial costs one search, so `searchesUsed` counts trials and the
 * budget assertions read as a plain trial count.
 */
function runOracle(
  state: TunerState,
  oracle: Oracle,
  maxSteps = 5000,
): TunerState {
  let current = state

  for (let step = 0; step < maxSteps; step += 1) {
    if (current.stage === "done" || current.stopped) {
      return current
    }
    const [request] = nextCandidates(current)
    if (!request) {
      return current
    }
    current = recordTrial(current, {
      id: request.id,
      config: request.config,
      objective: objectiveOf(oracle(request.config, request.scope)),
      scope: request.scope,
      stage: request.stage,
      searches: 1,
      label: request.label,
      bypassCache: request.bypassCache,
    })
  }

  throw new Error("Run did not terminate within maxSteps")
}

function oracleState(options: {
  cases?: number
  trainIds?: string[]
  holdoutIds?: string[]
  maxSearches?: number
} = {}): TunerState {
  const golden = oracleSet(options.cases ?? 3)
  const ids = golden.cases.map((item) => item.id)
  return createTunerState({
    set: golden,
    start: START,
    space: defaultTuneSpace(golden, START.weights),
    trainIds: options.trainIds ?? ids,
    holdoutIds: options.holdoutIds ?? [],
    maxSearches: options.maxSearches ?? BUDGET_PRESETS.thorough,
  })
}

/**
 * Peak weights for {@link tentValue}, each exactly on the snapped grid.
 *
 * On-grid targets matter: an optimum between two grid points would make the
 * brute force answer unreachable and the comparison meaningless.
 */
const TENT_TARGETS: Record<string, number> = {
  title: 0.1,
  price: 10,
  brand: 1,
}

/**
 * Separable tent in log weight space, peaking on {@link TENT_TARGETS}.
 *
 * Separable means coordinate ascent should reach the global optimum exactly,
 * so this fixture tests the machinery rather than the search heuristic.
 * Turning an aspect off costs far more than the noise floor, so parsimony
 * cannot trade an aspect away for a tie.
 */
function tentValue(config: TuneConfig): number {
  let value = 0.9
  for (const [name, target] of Object.entries(TENT_TARGETS)) {
    const weight = config.weights[name] ?? 1
    if (weight <= 0) {
      value -= 0.3
      continue
    }
    value -= 0.05 * Math.abs(Math.log10(weight) - Math.log10(target))
  }
  return value
}

/**
 * Same tent, but `brand` is pure noise that is best turned off.
 *
 * Keeping brand on costs slightly more than the noise floor, so the run has
 * to reach the optimum through the screen stage rather than the weight grid.
 */
function offIsBestValue(config: TuneConfig): number {
  const brand = config.weights.brand ?? 1
  let value = 0.9
  for (const name of ["title", "price"]) {
    const weight = config.weights[name] ?? 1
    if (weight <= 0) {
      value -= 0.3
      continue
    }
    const target = TENT_TARGETS[name]
    value -= 0.05 * Math.abs(Math.log10(weight) - Math.log10(target))
  }
  return brand > 0 ? value - 0.01 : value
}

/**
 * A cliff: the reward needs title down and price up at the same time.
 *
 * Every single-aspect move off the start config is flat, so coordinate
 * ascent has no gradient to follow toward the optimum.
 */
function cliffValue(config: TuneConfig): number {
  const title = config.weights.title ?? 1
  const price = config.weights.price ?? 1
  if (title <= 0 || price <= 0) {
    return 0.3
  }
  return title <= 0.1 && price >= 10 ? 0.95 : 0.6
}

describe("tuner brute force oracle", () => {
  it("finds the global grid optimum of a separable objective", () => {
    const optimum = bestOnGrid(ASPECTS, tentValue, START.fetchK)
    const state = runOracle(oracleState(), (config) => tentValue(config))
    const champion = championOf(state)

    expect(champion).not.toBeNull()
    expect(optimum.weights).toEqual(TENT_TARGETS)
    expect(champion!.config.weights).toEqual(optimum.weights)
    expect(champion!.objective.value).toBeCloseTo(optimum.value, 10)
  })

  it("keeps the champion within the noise floor of the grid optimum", () => {
    const optimum = bestOnGrid(ASPECTS, tentValue, START.fetchK)
    const state = runOracle(oracleState(), (config) => tentValue(config))

    const gap = optimum.value - championOf(state)!.objective.value
    expect(gap).toBeLessThanOrEqual(measuredNoiseFloor(0))
  })

  it("turns off an aspect when off is the grid optimum", () => {
    const optimum = bestOnGrid(ASPECTS, offIsBestValue, START.fetchK)
    const state = runOracle(oracleState(), (config) => offIsBestValue(config))
    const champion = championOf(state)

    expect(optimum.weights.brand).toBe(0)
    expect(champion!.config.weights).toEqual(optimum.weights)
  })

  it("does not reach an optimum that needs two weights to move at once (known coordinate ascent gap)", () => {
    const optimum = bestOnGrid(ASPECTS, cliffValue, START.fetchK)
    const state = runOracle(oracleState(), (config) => cliffValue(config))
    const champion = championOf(state)

    // The optimum exists on the grid and is well clear of the noise floor.
    expect(optimum.value).toBeCloseTo(0.95, 10)

    // Coordinate ascent cannot see it, because every single move is flat.
    // Asserted rather than skipped so an improved search fails this test
    // instead of silently passing a weaker one.
    expect(champion!.objective.value).toBeCloseTo(0.6, 10)
    expect(optimum.value - champion!.objective.value).toBeGreaterThan(
      measuredNoiseFloor(0),
    )
  })

  it("never issues more searches than the budget allows", () => {
    for (const maxSearches of [1, 2, 5, 17, 60, 250, 5000]) {
      const state = runOracle(
        oracleState({ maxSearches }),
        (config) => tentValue(config),
      )

      expect(state.searchesUsed).toBeLessThanOrEqual(maxSearches)
      // Either the budget stopped the run or the search space ran out.
      expect(
        state.stage === "done" || nextCandidates(state).length === 0,
      ).toBe(true)
    }
  })

  it("completes without spending a budget larger than the whole space", () => {
    const state = runOracle(
      oracleState({ maxSearches: 100000 }),
      (config) => tentValue(config),
    )

    expect(state.stage).toBe("done")
    expect(state.exhausted).toBe(false)
    expect(state.searchesUsed).toBeLessThan(100000)
    expect(championOf(state)!.config.weights).toEqual(TENT_TARGETS)
  })

  it("ignores holdout trials when picking the champion", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `c${index}`)
    const withoutHoldout = runOracle(
      oracleState({ cases: 10 }),
      (config) => tentValue(config),
    )
    // Score the holdout far above anything a train trial can reach, so an
    // unguarded champion swap would show up here.
    const withHoldout = runOracle(
      oracleState({
        cases: 10,
        trainIds: ids.slice(0, 7),
        holdoutIds: ids.slice(7),
      }),
      (config, scope) => scope === "holdout" ? 10 : tentValue(config),
    )

    const champion = championOf(withHoldout)!
    expect(champion.scope).not.toBe("holdout")
    expect(champion.config).toEqual(championOf(withoutHoldout)!.config)
    expect(champion.objective.value).toBeCloseTo(
      championOf(withoutHoldout)!.objective.value,
      10,
    )
    // The holdout still gets reported, just not as the champion.
    expect(withHoldout.holdoutObjective?.value).toBe(10)
  })
})

describe("forbidden documents in the objective", () => {
  function row(id: string, distance: number): SearchResultRow {
    return { id, distance }
  }

  function run(caseId: string, ids: string[]): CaseRun {
    return {
      caseId,
      rows: ids.map((id, index) => row(id, index / 100)),
      weightsUsed: {},
      request: { k: 3, query: {} },
      signature: `${caseId}:${ids.join(",")}`,
      error: null,
    }
  }

  const forbiddenSet: GoldenSet = {
    ...emptyGoldenSet("catalog", schema),
    k: 3,
    cases: [
      {
        ...oracleCase("ranked"),
        expected: [{ id: "good", gain: 3 }, { id: "alsoGood", gain: 1 }],
        forbidden: ["banned"],
      },
      { ...oracleCase("clean"), expected: [{ id: "ok", gain: 1 }] },
    ],
  }

  it("prefers a lower primary metric over a forbidden hit", () => {
    // Perfect ranking on both cases, but one surfaces a forbidden document.
    const withForbidden = liveObjective(
      forbiddenSet,
      new Map([
        ["ranked", run("ranked", ["good", "alsoGood", "banned"])],
        ["clean", run("clean", ["ok", "x", "y"])],
      ]),
    )
    // Slightly worse ranking, nothing forbidden.
    const clean = liveObjective(
      forbiddenSet,
      new Map([
        ["ranked", run("ranked", ["good", "filler", "alsoGood"])],
        ["clean", run("clean", ["ok", "x", "y"])],
      ]),
    )

    expect(withForbidden.summary.forbidden).toBe(1)
    expect(clean.summary.forbidden).toBe(0)

    // The forbidden config really does measure higher on the raw metric.
    expect(clean.primary).toBeLessThan(withForbidden.primary)
    // It still loses the objective, by exactly the penalty for one case in two.
    expect(clean.value).toBeGreaterThan(withForbidden.value)
    expect(withForbidden.value).toBeCloseTo(
      withForbidden.primary - FORBIDDEN_PENALTY / 2,
      10,
    )
  })
})

describe("weight 0 in the request", () => {
  it("drops the aspect from the query and the weights", () => {
    const request = buildCaseRequest(
      oracleCase("c0"),
      { title: 0, price: 2, brand: 1 },
      5,
    )

    expect(Object.keys(request.query).sort()).toEqual(["brand", "price"])
    expect(request.weights).toEqual({ price: 2, brand: 1 })
  })

  it("sends no weights at all when every aspect is off", () => {
    const request = buildCaseRequest(
      oracleCase("c0"),
      { title: 0, price: 0, brand: 0 },
      5,
    )

    expect(request.query).toEqual({})
    expect(request.weights).toBeUndefined()
  })
})
